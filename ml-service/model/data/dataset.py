"""
WealthGenie ML Microservice - Dataset Module
PyTorch Dataset class and DataLoader factory for batching, shuffling, and data splitting.
"""

from typing import Tuple, Optional
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split

from model.config import TrainingConfig
from model.data.preprocessing import FeaturePreprocessor


class FinancialDataset(Dataset):
    """PyTorch Dataset wrapping standardized feature matrices and target class labels."""

    def __init__(self, X: np.ndarray, y: Optional[np.ndarray] = None):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.long) if y is not None else None

    def __len__(self) -> int:
        return len(self.X)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        if self.y is not None:
            return self.X[idx], self.y[idx]
        return self.X[idx], torch.tensor(-1, dtype=torch.long)


def create_data_loaders(
    X: np.ndarray,
    y: np.ndarray,
    preprocessor: FeaturePreprocessor,
    config: TrainingConfig
) -> Tuple[DataLoader, DataLoader, DataLoader, FeaturePreprocessor]:
    """
    Splits features and targets into Train/Validation/Test sets, fits the FeaturePreprocessor,
    and returns PyTorch DataLoader objects for training, validation, and testing.
    """
    # 1. First split: Train+Val vs Test
    test_ratio = config.test_split
    X_train_val, X_test, y_train_val, y_test = train_test_split(
        X, y, test_size=test_ratio, random_state=config.random_seed, stratify=y
    )

    # 2. Second split: Train vs Validation
    val_ratio = config.val_split / (1.0 - test_ratio)
    X_train, X_val, y_train, y_val = train_test_split(
        X_train_val, y_train_val, test_size=val_ratio, random_state=config.random_seed, stratify=y_train_val
    )

    # 3. Fit scaler on training set only, then transform all sets
    X_train_scaled = preprocessor.fit_transform(X_train)
    X_val_scaled = preprocessor.transform(X_val)
    X_test_scaled = preprocessor.transform(X_test)

    # 4. Create PyTorch Datasets
    train_dataset = FinancialDataset(X_train_scaled, y_train)
    val_dataset = FinancialDataset(X_val_scaled, y_val)
    test_dataset = FinancialDataset(X_test_scaled, y_test)

    # 5. Build DataLoaders
    train_loader = DataLoader(
        train_dataset, batch_size=config.batch_size, shuffle=True, drop_last=False
    )
    val_loader = DataLoader(
        val_dataset, batch_size=config.batch_size, shuffle=False, drop_last=False
    )
    test_loader = DataLoader(
        test_dataset, batch_size=config.batch_size, shuffle=False, drop_last=False
    )

    return train_loader, val_loader, test_loader, preprocessor
