import { Subject } from '../types/quiz';

export const SUBJECT_CATALOG: Subject[] = [
  // --- HỌC KỲ 2025.2 ---
  {
    id: 'IT3080',
    code: 'IT3080',
    name: 'Mạng máy tính',
    semester: '2025.2',
    description:
      'Kiến trúc mạng OSI/TCP-IP, định tuyến, chuyển mạch, chia mạng con, giao thức tầng mạng và ứng dụng.',
    badge: 'Đề thi & Ngân hàng đầy đủ',
    examFiles: [
      {
        label: 'Ngân hàng tổng hợp (OldExam.json)',
        filePath: '/2025.2/IT3080 - Mạng máy tính/Gemini/OldExam.json',
        isDefault: true,
      },
      {
        label: 'Bộ câu hỏi chọn lọc (GeneratedQuiz.json)',
        filePath: '/2025.2/IT3080 - Mạng máy tính/Gemini/GeneratedQuiz.json',
      },
      {
        label: 'Bộ câu hỏi đã phân loại (SortedExam.json)',
        filePath: '/2025.2/IT3080 - Mạng máy tính/Gemini/SortedExam.json',
      },
    ],
  },
  {
    id: 'IT3040',
    code: 'IT3040',
    name: 'Kỹ thuật lập trình',
    semester: '2025.2',
    description:
      'Kỹ thuật lập trình C/C++, con trỏ, cấp phát bộ nhớ, đệ quy, tối ưu mã nguồn và cấu trúc dữ liệu cơ bản.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (OldExam.json)',
        filePath: '/2025.2/IT3040 - Kỹ thuật lập trình/Gemini/OldExam.json',
        isDefault: true,
      },
      {
        label: 'Bộ câu hỏi trắc nghiệm (GeneratedQuiz.json)',
        filePath: '/2025.2/IT3040 - Kỹ thuật lập trình/Gemini/GeneratedQuiz.json',
      },
    ],
  },
  {
    id: 'IT3070',
    code: 'IT3070',
    name: 'Nguyên lý hệ điều hành',
    semester: '2025.2',
    description:
      'Tiến trình, luồng, đồng bộ hóa, bế tắc (deadlock), quản lý bộ nhớ, hệ thống file và ảo hóa.',
    badge: 'Ngân hàng & Bài tập tổng hợp',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (OldExam.json)',
        filePath: '/2025.2/IT3070 - Nguyên lý hệ điều hành/Gemini/OldExam.json',
        isDefault: true,
      },
      {
        label: 'Bộ câu hỏi trắc nghiệm (GeneratedQuiz.json)',
        filePath:
          '/2025.2/IT3070 - Nguyên lý hệ điều hành/Gemini/GeneratedQuiz.json',
      },
    ],
  },
  {
    id: 'IT3090',
    code: 'IT3090',
    name: 'Cơ sở dữ liệu',
    semester: '2025.2',
    description:
      'Mô hình dữ liệu quan hệ, đại số quan hệ, SQL chuẩn, chuẩn hóa dữ liệu (1NF-3NF/BCNF) và tối ưu hóa truy vấn.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (OldExam.json)',
        filePath: '/2025.2/IT3090 - Cơ sở dữ liệu/Gemini/OldExam.json',
        isDefault: true,
      },
      {
        label: 'Bộ câu hỏi trắc nghiệm (GeneratedQuiz.json)',
        filePath: '/2025.2/IT3090 - Cơ sở dữ liệu/Gemini/GeneratedQuiz.json',
      },
    ],
  },

  // --- HỌC KỲ 2026.1 ---
  {
    id: 'IT3120',
    code: 'IT3120',
    name: 'Phân tích và thiết kế hệ thống',
    semester: '2026.1',
    description:
      'Mô hình hóa hệ thống thông tin, chuẩn UML, Use Case, Sequence Diagram, Class Diagram, Activity Diagram.',
    badge: 'Mô hình UML & Thiết kế chuẩn',
    examFiles: [
      {
        label: 'Ngân hàng đề chính thức (exam.json)',
        filePath:
          '/2026.1/IT3120 - Phân tích và thiết kế hệ thống/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT3180',
    code: 'IT3180',
    name: 'Nhập môn công nghệ phần mềm',
    semester: '2026.1',
    description:
      'Quy trình phát triển phần mềm (Agile/Scrum, Waterfall, V-Model), phân tích yêu cầu, thiết kế kiến trúc và kiểm thử.',
    badge: 'Lý thuyết & Bài tập tự luận',
    examFiles: [
      {
        label: 'Ngân hàng đề tổng hợp (exam.json)',
        filePath:
          '/2026.1/IT3180 - Nhập môn công nghệ phần mềm/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT3190',
    code: 'IT3190',
    name: 'Học máy và khai phá dữ liệu',
    semester: '2026.1',
    description:
      'Hồi quy, phân lớp (SVM, Decision Tree, Naive Bayes), gom cụm (K-means, Hierarchical), giảm chiều dữ liệu (PCA).',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (Exam.json)',
        filePath:
          '/2026.1/IT3190 - Học máy và khai phá dữ liệu/Gemini/Exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4244',
    code: 'IT4244',
    name: 'Quản trị dự án CNTT',
    semester: '2026.1',
    description:
      'Lập kế hoạch, ước lượng chi phí, quản trị rủi ro, quản trị tiến độ CPM/PERT và quản lý chất lượng dự án.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.1/IT4244 - Quản trị dự án CNTT/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4930',
    code: 'IT4930',
    name: 'Nhập môn khoa học dữ liệu',
    semester: '2026.1',
    description:
      'Thu thập, làm sạch dữ liệu, trực quan hóa, phân tích thăm dò EDA, thống kê suy diễn và thuật toán mạng/đồ thị.',
    badge: 'Phân tích & Thống kê dữ liệu',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.1/IT4930 - Nhập môn khoa học dữ liệu/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4931',
    code: 'IT4931',
    name: 'Lưu trữ và xử lý dữ liệu lớn',
    semester: '2026.1',
    description:
      'Hệ thống tệp phân tán HDFS, mô hình MapReduce, Apache Spark, NoSQL (HBase, Cassandra, MongoDB) và Kafka.',
    examFiles: [
      {
        label: 'Ngân hàng đề chính thức (exam.json)',
        filePath:
          '/2026.1/IT4931 - Lưu trữ và xử lý dữ liệu lớn/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },

  // --- HỌC KỲ 2026.2 ---
  {
    id: 'IT4015',
    code: 'IT4015',
    name: 'Nhập môn an toàn thông tin',
    semester: '2026.2',
    description:
      'Mật mã học đối xứng, bất đối xứng (RSA, AES), hàm băm, chữ ký số, chứng chỉ số và bảo mật mạng.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath:
          '/2026.2/IT4015 - Nhập môn an toàn thông tin/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4613',
    code: 'IT4613',
    name: 'Hệ gợi ý',
    semester: '2026.2',
    description:
      'Lọc cộng tác (Collaborative Filtering), gợi ý dựa trên nội dung (Content-based), phân rã ma trận (Matrix Factorization).',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.2/IT4613 - Hệ gợi ý/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4653',
    code: 'IT4653',
    name: 'Học sâu và ứng dụng',
    semester: '2026.2',
    description:
      'Mạng nơ-ron sâu MLP, CNN trong thị giác máy tính, RNN/LSTM/Transformer trong xử lý ngôn ngữ tự nhiên.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.2/IT4653 - Học sâu và ứng dụng/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4663',
    code: 'IT4663',
    name: 'Tối ưu lập kế hoạch',
    semester: '2026.2',
    description:
      'Quy hoạch tuyến tính, nguyên lý tối ưu Bellman, giải thuật nhánh cận và tìm kiếm meta-heuristic.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.2/IT4663 - Tối ưu lập kế hoạch/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
  {
    id: 'IT4906',
    code: 'IT4906',
    name: 'Tính toán tiến hóa',
    semester: '2026.2',
    description:
      'Giải thuật di truyền GA (Genetic Algorithms), bầy đàn PSO, lập trình tiến hóa và chiến lược tiến hóa.',
    examFiles: [
      {
        label: 'Ngân hàng đề thi (exam.json)',
        filePath: '/2026.2/IT4906 - Tính toán tiến hóa/Gemini/exam.json',
        isDefault: true,
      },
    ],
  },
];
