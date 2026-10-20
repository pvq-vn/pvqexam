import json
import os
import random

DATA_FILE = "progress.json"

# Danh sách 50 đề (loại trừ các đề 850+)
ALL_TESTS = [
    # Bộ đề 2026 (10 đề)
    *[f"Bộ đề 2026 - Bộ đề thi thử sát đề thi TOEIC thật: Đề số {i:02d}" for i in range(1, 11)],
    
    # Bộ đề thực tế 2024-2026 (7 đề)
    "Bộ đề 2024: Đề thi thực tế - Đề số 01",
    "Bộ đề 2024: Đề thi thực tế - Đề số 02",
    "Bộ đề 2024: Đề thi thực tế - Đề số 03",
    "Đề thi thực tế nửa đầu năm 2025: Đề số 01",
    "Đề thi thực tế nửa đầu năm 2025: Đề số 02",
    "Đề thi thực tế nửa đầu năm 2026: Đề số 01",
    "Đề thi thực tế nửa đầu năm 2026: Đề số 02",
    
    # Bộ đề 2025 (12 đề)
    *[f"Bộ đề 2025 - Bộ đề thi thử sát đề thi TOEIC thật: Đề số {i:02d}" for i in range(1, 13)],
    
    # Bộ đề 2024 (10 đề)
    *[f"Bộ đề 2024: Bộ đề thi thử sát đề thi TOEIC thật _ Đề số {i:02d}" for i in range(1, 11)],
    
    # Bộ đề 2022 (10 đề, không tính 2023 vì danh sách đã đủ 50 đề)
    *[f"Bộ đề 2022: Bộ đề thi thử sát đề thi TOEIC thật _ Đề số {i:02d}" for i in range(1, 11)],
    
    # 1 đề từ bộ 2023 để khớp đúng 50 đề
    # "Bộ đề 2023: Bộ đề thi thử sát đề thi TOEIC thật _ Đề số 01",
][:50]


def load_completed_tests():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_completed_tests(completed):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(list(completed), f, ensure_ascii=False, indent=2)


def pick_test():
    completed = load_completed_tests()
    remaining = [t for t in ALL_TESTS if t not in completed]

    if not remaining:
        print("Đã cày hết sạch 50 đề rồi!")
        return

    chosen = random.choice(remaining)
    completed.add(chosen)
    save_completed_tests(completed)

    print(f"🎯 Đề cần làm hôm nay:\n{chosen}")
    print(f"\nTiến độ: {len(completed)}/50 đề đã xong.")


if __name__ == "__main__":
    pick_test()