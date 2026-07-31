"""
Recomputes real semantic embedding similarity scores across all 25 samples in llm_eval_report.json
using the fixed SentenceTransformerEmbeddingProvider import path.
"""

import json
import sys
from pathlib import Path
import numpy as np

ML_SERVICE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_SERVICE_DIR))

from llm.evaluation.metrics import compute_embedding_semantic_similarity

REPORT_PATH = ML_SERVICE_DIR / "reports" / "llm_eval_report.json"

def main():
    with open(REPORT_PATH, "r", encoding="utf-8") as f:
        report = json.load(f)

    samples = report["per_sample_results"]
    semantic_scores = []

    for item in samples:
        ref = item["gold_reference"]
        cand = item["generated_response"]
        real_sem = compute_embedding_semantic_similarity(ref, cand)
        item["metrics"]["semantic_embedding_similarity"] = real_sem
        semantic_scores.append(real_sem)

        # Recalculate composite quality score
        bleu = item["metrics"]["bleu"]
        rougeL = item["metrics"]["rougeL"]
        lexical = item["metrics"]["lexical_overlap_score"]
        faith = item["metrics"]["faithfulness_score"]
        composite = (bleu + rougeL + lexical + real_sem + faith) / 5.0
        item["metrics"]["composite_quality_score"] = round(composite, 4)

    new_mean_sem = round(float(np.mean(semantic_scores)), 4)
    old_mean_sem = report["aggregate_metrics"]["mean_semantic_embedding_similarity"]

    report["aggregate_metrics"]["mean_semantic_embedding_similarity"] = new_mean_sem

    # Update worst 3 failure analysis with new scores
    sorted_results = sorted(samples, key=lambda x: x["metrics"]["composite_quality_score"])
    worst_3 = []
    for item in sorted_results[:3]:
        worst_3.append({
            "id": item["id"],
            "instruction": item["instruction"],
            "generated_response": item["generated_response"],
            "gold_reference": item["gold_reference"],
            "metrics": item["metrics"],
            "failure_analysis": "Low semantic embedding similarity; low surface n-gram BLEU overlap",
        })
    report["worst_3_failure_analysis"] = worst_3

    with open(REPORT_PATH, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"Old Fallback Semantic Score (duplicated lexical): {old_mean_sem}")
    print(f"New Real SentenceTransformer Semantic Score:      {new_mean_sem}")

if __name__ == "__main__":
    main()
