"""
WealthGenie ML Microservice - PyTorch Model Trainer
Orchestrates neural network training, validation loss monitoring, early stopping, and artifact saving.
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, Any, Tuple, List

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from model.config import (
    PyTorchModelConfig,
    TrainingConfig,
    ArtifactPaths,
    get_device,
    set_random_seed,
)
from model.dataset import create_data_loaders
from model.model import FinancialMLP
from model.preprocessing import FeaturePreprocessor, prepare_synthetic_training_data

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("wealthgenie.pytorch_trainer")


class EarlyStopping:
    """Monitors validation loss and signals early stopping when no improvement occurs within patience epochs."""

    def __init__(self, patience: int = 15, min_delta: float = 1e-4):
        self.patience = patience
        self.min_delta = min_delta
        self.counter = 0
        self.best_loss = float("inf")
        self.early_stop = False

    def __call__(self, val_loss: float) -> bool:
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.early_stop = True
        return self.early_stop


def train_pytorch_model(
    model_config: PyTorchModelConfig = PyTorchModelConfig(),
    training_config: TrainingConfig = TrainingConfig(),
    paths: ArtifactPaths = ArtifactPaths(),
    X: np.ndarray = None,
    y: np.ndarray = None,
) -> Dict[str, Any]:
    """
    Executes complete training pipeline for the PyTorch FinancialMLP model.
    Saves model weights, scaler, and training metadata to disk.
    """
    set_random_seed(training_config.random_seed)
    device = get_device()
    logger.info(f"Initiating PyTorch training on device: {device}")

    # 1. Prepare synthetic dataset if X, y not explicitly provided
    if X is None or y is None:
        logger.info("Generating synthetic training dataset...")
        X, y = prepare_synthetic_training_data(num_samples=2000, seed=training_config.random_seed)

    preprocessor = FeaturePreprocessor()
    train_loader, val_loader, test_loader, preprocessor = create_data_loaders(
        X, y, preprocessor, training_config
    )

    # 2. Instantiate model, loss, optimizer, and LR scheduler
    model = FinancialMLP(model_config).to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.AdamW(
        model.parameters(),
        lr=training_config.learning_rate,
        weight_decay=training_config.weight_decay,
    )
    scheduler = optim.lr_scheduler.ReduceLROnPlateau(
        optimizer,
        mode="min",
        factor=training_config.lr_scheduler_factor,
        patience=training_config.lr_scheduler_patience,
        min_lr=training_config.min_lr,
    )
    early_stopping = EarlyStopping(patience=training_config.patience)

    history: Dict[str, List[float]] = {
        "train_loss": [],
        "val_loss": [],
        "train_acc": [],
        "val_acc": [],
        "learning_rates": [],
    }

    start_time = time.time()
    best_val_loss = float("inf")
    best_model_weights = None

    logger.info(f"Starting training for up to {training_config.epochs} epochs...")

    for epoch in range(1, training_config.epochs + 1):
        # ── Training Phase ──
        model.train()
        running_loss = 0.0
        correct_train = 0
        total_train = 0

        for inputs, targets in train_loader:
            inputs, targets = inputs.to(device), targets.to(device)

            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            _, predicted = torch.max(outputs, 1)
            total_train += targets.size(0)
            correct_train += (predicted == targets).sum().item()

        epoch_train_loss = running_loss / total_train
        epoch_train_acc = correct_train / total_train

        # ── Validation Phase ──
        model.eval()
        val_running_loss = 0.0
        correct_val = 0
        total_val = 0

        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, targets)

                val_running_loss += loss.item() * inputs.size(0)
                _, predicted = torch.max(outputs, 1)
                total_val += targets.size(0)
                correct_val += (predicted == targets).sum().item()

        epoch_val_loss = val_running_loss / total_val
        epoch_val_acc = correct_val / total_val

        current_lr = optimizer.param_groups[0]["lr"]
        scheduler.step(epoch_val_loss)

        history["train_loss"].append(epoch_train_loss)
        history["val_loss"].append(epoch_val_loss)
        history["train_acc"].append(epoch_train_acc)
        history["val_acc"].append(epoch_val_acc)
        history["learning_rates"].append(current_lr)

        if epoch % 10 == 0 or epoch == 1:
            logger.info(
                f"Epoch {epoch:03d}/{training_config.epochs:03d} | "
                f"Train Loss: {epoch_train_loss:.4f} Acc: {epoch_train_acc:.4f} | "
                f"Val Loss: {epoch_val_loss:.4f} Acc: {epoch_val_acc:.4f} | LR: {current_lr:.6f}"
            )

        # Check for best model checkpointing
        if epoch_val_loss < best_val_loss:
            best_val_loss = epoch_val_loss
            best_model_weights = model.state_dict().copy()

        if early_stopping(epoch_val_loss):
            logger.info(f"Early stopping triggered at epoch {epoch}")
            break

    elapsed_time = time.time() - start_time
    logger.info(f"Training completed in {elapsed_time:.2f} seconds.")

    # 3. Load best weights before saving
    if best_model_weights is not None:
        model.load_state_dict(best_model_weights)

    # 4. Save artifacts
    paths.model_weights.parent.mkdir(parents=True, exist_ok=True)
    torch.save(model.state_dict(), paths.model_weights)
    preprocessor.save(paths.scaler_path)

    metadata = {
        "model_type": "PyTorch_FinancialMLP",
        "version": "1.0.0",
        "training_time_seconds": round(elapsed_time, 4),
        "epochs_completed": len(history["train_loss"]),
        "best_val_loss": round(best_val_loss, 4),
        "best_val_accuracy": round(max(history["val_acc"]), 4),
        "model_config": model_config.model_dump(),
        "training_config": training_config.model_dump(),
        "device_used": str(device),
        "target_classes": ["Equity_MF", "ELSS", "ETF", "Debt_MF", "FD", "RBI_Bond"],
    }

    with open(paths.metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(paths.metrics_path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)

    logger.info(f"Saved PyTorch model weights to {paths.model_weights}")
    logger.info(f"Saved scaler to {paths.scaler_path}")
    logger.info(f"Saved metadata to {paths.metadata_path}")

    return {
        "metadata": metadata,
        "history": history,
        "preprocessor": preprocessor,
        "model": model,
        "test_loader": test_loader,
    }


if __name__ == "__main__":
    train_pytorch_model()
