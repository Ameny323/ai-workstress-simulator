"""Verification for score_validation_submission.

Plain assert-based tests, collectible by pytest once it's installed, but
also directly runnable right now without it:
    python tests/test_data_validation_scoring.py
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.tasks.data_validation import score_validation_submission


def _records(is_valid_flags):
    """is_valid_flags: list of bools, indexed by id starting at 1."""
    return {"records": [{"id": i + 1, "is_valid": v} for i, v in enumerate(is_valid_flags)]}


def test_perfect_submission():
    instance = _records([True, False, True, False])  # invalid ids: 2, 4
    result = score_validation_submission(instance, {"flagged_ids": [2, 4]})
    assert result == {
        "content_score": 100,
        "error_count": 0,
        "correct_count": 4,
        "total_count": 4,
    }


def test_fully_wrong_submission():
    instance = _records([True, False, True, False])  # invalid ids: 2, 4
    result = score_validation_submission(instance, {"flagged_ids": [1, 3]})
    assert result == {
        "content_score": 0,
        "error_count": 4,
        "correct_count": 0,
        "total_count": 4,
    }


def test_partially_correct_submission():
    instance = _records([True, False, True, False])  # invalid ids: 2, 4
    # correctly flags 2, misses 4 (false negative), wrongly flags 1 (false positive)
    result = score_validation_submission(instance, {"flagged_ids": [1, 2]})
    assert result == {
        "content_score": 50,
        "error_count": 2,
        "correct_count": 2,
        "total_count": 4,
    }


def test_empty_flagged_ids_when_all_valid_is_perfect():
    instance = _records([True, True, True])
    result = score_validation_submission(instance, {"flagged_ids": []})
    assert result["content_score"] == 100
    assert result["error_count"] == 0


def test_unknown_flagged_id_is_ignored():
    # an id with no matching record can't affect any record's comparison
    instance = _records([True, False])
    result = score_validation_submission(instance, {"flagged_ids": [2, 999]})
    assert result["content_score"] == 100
    assert result["error_count"] == 0


TESTS = [
    test_perfect_submission,
    test_fully_wrong_submission,
    test_partially_correct_submission,
    test_empty_flagged_ids_when_all_valid_is_perfect,
    test_unknown_flagged_id_is_ignored,
]

if __name__ == "__main__":
    failures = 0
    for test in TESTS:
        try:
            test()
            print(f"PASS  {test.__name__}")
        except AssertionError as e:
            failures += 1
            print(f"FAIL  {test.__name__}: {e}")

    print()
    if failures:
        print(f"{failures}/{len(TESTS)} failed")
        sys.exit(1)
    print(f"All {len(TESTS)} passed")
