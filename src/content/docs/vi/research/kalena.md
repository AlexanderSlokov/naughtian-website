---
title: "Dự án Naughtian Kalena: Lập lịch Overcommitment Trực tuyến (Borg-at-home)"
description: "Đề xuất và thiết kế kiến trúc của Kalena: Bộ điều phối trực tuyến khai thác tài nguyên dư thừa trong hệ sinh thái Naughtian."
tableOfContents:
  maxHeadingLevel: 3
sidebar:
  label: "Kalena (Đề xuất)"
  order: 4
  badge:
    text: Bản nháp
    variant: note
head:
  - tag: style
    content: |
      .sl-markdown-content p,
      .sl-markdown-content li { text-align: justify; }
---

:::caution[Bản đề xuất đang biên soạn]
Tài liệu này được biên soạn thông qua phỏng vấn trực tiếp. Các mục phản ánh định hướng thiết kế và mô hình toán đang trong giai đoạn đề xuất.
:::

> **Mã dự án:** _Kalena_
>
> **Định vị:** _"Borg-at-home" - Bộ điều phối trực tuyến và thu hoạch dung lượng dôi dư (Slack Resource Harvester)_
>
> **Tác giả:** _Dinh Tan Dung (ORCID: https://orcid.org/0009-0003-1374-7525)_
>
> **Trạng thái:** _Draft Proposal (2026)_

---

## Tóm tắt (Abstract)

Các cụm máy chủ tự quản (on-premise) và hạ tầng biên (edge) thường xuyên hoạt động ở mức 30-40% công suất thực tế do các kỹ sư vận hành phải thiết lập biên an toàn tĩnh (static headroom) dư thừa cho tác vụ sản xuất. Trong hệ sinh thái Naughtian, Kuberina đã giải quyết bài toán đóng gói tổ hợp ngoại tuyến để tạo ra blueprint tĩnh tối ưu. Sự biến thiên tải trong thời gian thực vẫn để lại khoảng trống tài nguyên nhàn rỗi lớn chưa được khai thác.

Chúng tôi đề xuất **Kalena** ("Borg-at-home"), một bộ điều phối trực tuyến (online scheduler) chuyên về kỹ thuật overcommit tài nguyên cho Kubernetes, Docker Standalone và Docker Swarm. Kalena thu thập dữ liệu viễn trắc trực tiếp từ cAdvisor, sử dụng mô hình ước lượng đỉnh suy giảm (Decayed Maximum) phỏng theo Google Borg để tính toán dung lượng dôi dư an toàn, đồng thời phân tầng ranh giới giữa tài nguyên nén được (CPU throttling qua CFS) và không nén được (RAM eviction). Mục tiêu thực nghiệm của Kalena là nâng tỷ lệ tận dụng tài nguyên cụm lên mức 70-85% trong khi giữ độ suy giảm trễ P99 của tác vụ sản xuất dưới 2%, mang lại giải pháp khai thác phần cứng triệt để cho 80% người dùng hạ tầng không có điều kiện tiếp cận các control plane doanh nghiệp đắt đỏ.

---

## 1. Bối cảnh & Vấn đề (Context & Problem)

### Sự lãng phí trong biên an toàn tĩnh (The Static Headroom Waste)

Trong quản lý hạ tầng hiện đại, người vận hành thường định cấu hình tài nguyên cho container (requests và limits) dựa trên kịch bản tải đỉnh cộng thêm biên độ dự phòng an toàn. Kuberina giải quyết bài toán tối ưu hoá tổ hợp ngoại tuyến (offline combinatorial optimization) để đóng gói các khối lượng công việc tĩnh vào số lượng máy chủ tối thiểu. 

Khoảng cách giữa tài nguyên cam kết trên giấy tờ và mức tiêu thụ thực tế theo thời gian thực vẫn tồn tại. Biên độ an toàn (headroom) tạo ra sự lãng phí tài nguyên phần cứng lớn. Phần cứng đắt tiền tại chỗ (on-premise) hoặc hạ tầng biên (edge) thường xuyên chạy dưới công suất thực tế dù bảng phân bổ tài nguyên đã báo đầy.

### Khoảng trống kỹ thuật (The Gap)

Hạ tầng quy mô lớn như Google sử dụng hệ thống Borg để giải quyết vấn đề này bằng cách kết hợp tác vụ sản xuất có độ ưu tiên cao (prod-jobs) và các tác vụ thứ cấp chạy theo lô (non-prod / batch-jobs) trên cùng một máy chủ vật lý, khai thác triệt để năng lực phần cứng.

Các cụm máy chủ tự quản, môi trường biên và cụm vừa/nhỏ thiếu vắng một công cụ gọn nhẹ, độc lập để thực hiện cơ chế overcommit thông minh tương tự mà không đòi hỏi toàn bộ hệ sinh thái phức tạp của Kubernetes cỡ lớn hay các giải pháp quản lý độc quyền đắt đỏ.

---

## 2. Đề xuất: Kiến trúc "Borg-at-home" (Proposed Architecture)

Kalena được xây dựng với vai trò bộ điều phối trực tuyến (online scheduler) tập trung vào việc overcommit tài nguyên an toàn và linh hoạt.

### 2.1. Môi trường mục tiêu (Target Environments)

Hệ thống hỗ trợ song song hai nhóm môi trường hạ tầng:

* **Kubernetes (K8s):** Tích hợp thông qua Kubernetes Scheduling Framework chuẩn. Kalena cung cấp plugin mở rộng (Filter, Score, Reserve) để đưa trí tuệ overcommit vào quy trình lập lịch của cụm, đồng thời có thể vận hành dưới dạng Secondary Scheduler cho các tác vụ thứ cấp.
* **Docker Standalone & Docker Swarm:** Cung cấp bộ điều phối gọn nhẹ (standalone scheduler daemon) điều khiển trực tiếp Docker daemon và Swarm manager. Đây là sự hỗ trợ thiết thực cho nhóm 80% người dùng hạ tầng tự quản không vận hành control plane Kubernetes hoàn chỉnh.

### 2.2. Thu thập dữ liệu viễn trắc qua cAdvisor (Telemetry via cAdvisor)

Kalena chọn cAdvisor làm nguồn dữ liệu chuẩn duy nhất (single source of truth) cho thông số sử dụng tài nguyên tức thời:

* **Tích hợp sẵn (Built-in):** Trên Kubernetes, cAdvisor đã được nhúng sẵn bên trong Kubelet tại mỗi nút, cho phép truy xuất số liệu container trực tiếp với độ trễ thấp.
* **Độc lập và gọn nhẹ (Zero heavy pipeline):** Trên môi trường Docker và Docker Swarm, cAdvisor chạy dưới dạng một container duy nhất trên từng nút vật lý. Kalena thu thập trực tiếp số liệu từ cAdvisor mà không cần thiết lập hệ thống Prometheus cồng kềnh hay viết thêm exporter phụ trợ.

### 2.3. Cơ chế bảo vệ và thu hồi tài nguyên chuẩn Borg (Borg-aligned Preemption & Eviction)

Kalena áp dụng chặt chẽ các nguyên tắc điều phối và quản lý xung đột tài nguyên của Google Borg:

* **Phân loại tài nguyên:**
  * *Tài nguyên có thể nén (Compressible resources - CPU):* Khi xảy ra cạnh tranh tải, Kalena can thiệp qua cơ chế CFS bandwidth control / throttling để bóp băng thông CPU của tác vụ lô (batch jobs), nhường ưu tiên tuyệt đối cho tác vụ sản xuất (prod jobs).
  * *Tài nguyên không thể nén (Non-compressible resources - RAM):* Khi bộ nhớ chạm ngưỡng cảnh báo, Kalena lập tức kích hoạt cơ chế trục xuất (eviction/kill) các tác vụ lô theo thứ tự ưu tiên nghịch đảo, bảo vệ tác vụ sản xuất khỏi nguy cơ Out-Of-Memory (OOM).
* **Bộ tác tử thực thi tại nút (Kalena Node Agent):** Giữ vai trò tương đương Borglet, theo dõi áp lực tài nguyên cục bộ theo thời gian thực và thực thi các biện pháp khẩn cấp trước khi hệ điều hành hạt nhân tự động can thiệp.

### 2.4. Thuật toán ước lượng tài nguyên (Resource Estimation)

Lấy cảm hứng từ cơ chế Resource Estimation của Google Borg (EuroSys 2015), Kalena xác định dung lượng dôi dư (slack capacity) để đưa ra quyết định overcommit an toàn:

1. **Lấy mẫu định kỳ:** Kalena Node Agent liên tục đọc số liệu thực tế từ cAdvisor theo chu kỳ $T$ giây.
2. **Hàm suy giảm giá trị đỉnh (Decayed Maximum):** Kalena theo dõi giá trị sử dụng đỉnh trong một cửa sổ trượt có trọng số suy giảm theo thời gian, tránh nguy cơ ước lượng thiếu khi tải tăng đột ngột:
   $$\text{DecayedMax}(t) = \max\left(\text{Usage}(t), \alpha \times \text{DecayedMax}(t-1)\right)$$
3. **Biên an toàn động (Safety Margin):** Bổ sung một hệ số đệm $\lambda$ vào mức tiêu thụ dự tính:
   $$\text{EstimatedUsage} = \text{DecayedMax}(\text{Usage}) \times (1 + \lambda)$$
4. **Vùng tài nguyên dôi dư (Slack):** Dung lượng máy chủ có thể cấp phát cho các tác vụ lô được tính bằng phần chênh lệch giữa sức chứa thực tế và tổng mức ước lượng an toàn của các tác vụ chính:
   $$\text{Slack Capacity} = \text{NodeCapacity} - \sum \text{EstimatedUsage}_{\text{prod}}$$

### 2.5. Phân loại tác vụ giảm ma sát (Zero-Friction Workload Tiering)

Nhằm tối ưu trải nghiệm vận hành (OpX), Kalena áp dụng nguyên tắc giảm thiểu gánh nặng viết cấu hình manifest cho kỹ sư:

* **Mặc định an toàn (Safe Default):** Mọi workload không chứa bất kỳ định danh đặc biệt nào đều tự động được xem là Prod-job (bảo vệ tuyệt đối, không bị co hẹp tài nguyên hay trục xuất bất ngờ).
* **Định danh tối giản:** Để đưa một tác vụ vào diện khai thác headroom, người dùng chỉ cần thêm một nhãn duy nhất:
  ```yaml
  metadata:
    labels:
      kalena.naughtian.io/tier: batch
  ```
* **Tự động nhận diện (Auto-inference):** Khi kích hoạt tính năng tự động nhận diện, Kalena coi mọi đối tượng `Job` hoặc `CronJob` chuẩn của Kubernetes là ứng viên batch-job mà người vận hành không cần chỉnh sửa manifest gốc.

---

## 3. Vị trí trong hệ sinh thái Naughtian (Ecosystem Fit)

### Mối liên hệ biểu tượng và kiến trúc với Kuberina

Trong truyền thuyết của hệ sinh thái Naughtian, Kalena và Kuberina gắn liền với nhau như một cặp đôi đồng hành. Về mặt kiến trúc kỹ thuật, hai công cụ tạo nên một chu trình tối ưu khép kín:

* **Kuberina (Pha ngoại tuyến - Offline Pre-planning):** Đóng vai kiến trúc sư cảng biển, tính toán cách xếp các container hàng nặng (tác vụ sản xuất) vào toạ độ cố định trên thân tàu, thoả mãn mọi ràng buộc cứng trước khi tàu ra khơi.
* **Kalena (Pha trực tuyến - Online Dynamic Tuning):** Đóng vai thuỷ thủ đoàn trên hải trình, nhét các kiện hàng nhỏ nhẹ (tác vụ thu hoạch/lô) vào kẽ hở giữa các container lớn, sẵn sàng vứt bỏ kiện hàng nhẹ khi gặp bão tố nhằm bảo vệ an toàn cho tàu.

### 3.1. Hình thái lập lịch Tĩnh - Động lưỡng pha (Solid Rock & Liquid Flow)

Sự kết hợp giữa Kuberina và Kalena tạo nên một hình thái lập lịch độc đáo:

1. **Triệt tiêu chi phí lập lịch ở tải chính (Zero-Latency Baseline):** Tác vụ sản xuất được Kuberina gán cứng toạ độ (`nodeName`) từ blueprint YAML, giúp thời gian lập lịch runtime của tác vụ chính bằng 0ms.
2. **Tập trung tài nguyên scheduler cho phần dư:** Kalena chỉ dành chu kỳ tính toán để điều phối các tác vụ lô vào phần headroom nhàn rỗi.
3. **Vòng lặp tự thích nghi khép kín (Closed-Loop Feedback):** Kalena thu thập hồ sơ tiêu thụ thực tế theo thời gian và gửi ngược về cho Kuberina. Ở chu kỳ deploy kế tiếp, Kuberina dùng dữ liệu phân phối thực tế này để giải bài toán bin-packing chuẩn xác hơn.

### 3.2. Tính khả thi kiến trúc: Tách rời bài toán xếp chỗ sản xuất và thu hoạch tài nguyên

Nguyên nhân khiến các bộ lập lịch tập trung như Google Borg hoặc Kubernetes vanilla gặp khó khăn lớn khi triển khai overcommit trực tuyến là việc phải gánh vác đồng thời hai trách nhiệm đối nghịch:
1. Giải bài toán tổ hợp NP-hard (affinity, anti-affinity, gang scheduling, phân bổ topology) cho các tác vụ sản xuất quan trọng với độ trễ tính bằng mili-giây.
2. Ước lượng dung lượng dôi dư và điều phối các tác vụ lô chạy xen kẽ theo thời gian thực.

Kuberina giải quyết dứt điểm bài toán thứ nhất ở pha ngoại tuyến. Nhờ Kuberina dành thời gian tính toán kỹ lưỡng để tạo ra blueprint bất biến tối ưu, các tác vụ sản xuất đã có sẵn toạ độ nút cố định trước khi khởi chạy.

Sự phân tách này thay đổi hoàn toàn phạm vi kỹ thuật của Kalena:
* **Không gian bài toán đơn biến cục bộ:** Kalena xem xét dung lượng dôi dư trên từng nút độc lập. Hệ thống ghép các tác vụ lô nhẹ vào khoảng trống cục bộ mà không phải giải lại đồ thị ràng buộc phức tạp trên toàn cụm.
* **Quyết định can thiệp tức thời:** Khi tác vụ sản xuất tăng đột biến tải, Kalena đưa ra phản xạ nhị phân đơn giản: bóp băng thông CPU hoặc trục xuất tác vụ lô tại chỗ. Hệ thống hoàn toàn tránh được việc tái cân bằng phức tạp trên quy mô cụm.
* **Hiện thực hoá năng lực triển khai:** Nhờ Kuberina gánh vác toàn bộ phần xếp chỗ sản xuất, Kalena giữ được kích thước gọn nhẹ, độ tin cậy cao và hoàn toàn khả thi cho một đội ngũ kỹ sư tinh gọn phát triển.

---

## 4. Kế hoạch triển khai & Đánh giá (Implementation & Evaluation)

### 4.1. Lựa chọn ngôn ngữ phát triển (Tech Stack)

* **Ngôn ngữ chủ đạo: Go (Golang)** cho toàn bộ giai đoạn prototype và các phiên bản production đầu tiên. Go cung cấp sự tương thích tự nhiên và hoàn hảo với thư viện cốt lõi `k8s.io/kubernetes` (Scheduling Framework), `client-go` và `moby/moby` (Docker SDK).
* **Định hướng mở rộng:** Trong các phiên bản tương lai, nếu các bài toán mô hình hoá xác suất hay tính toán tổ hợp thời gian thực đòi hỏi hiệu năng tính toán cực cao, kiến trúc cho phép tích hợp nhân giải thuật viết bằng Rust thông qua cơ chế Go shim / FFI (tương đồng với bộ giải Rust của Kuberina).

### 4.2. Chỉ số đánh giá thành công (Evaluation Metrics)

Hiệu quả của Kalena được đo lường thông qua ba nhóm chỉ số cốt lõi:

1. **Tỷ lệ tận dụng tài nguyên cụm (Hardware Utilization):** Đo lường mức tăng trung bình của CPU và RAM trên toàn cụm. Mục tiêu cụ thể là đưa mức sử dụng trung bình từ 30-40% lên 70-85%.
2. **Mức độ bảo toàn SLO cho tác vụ chính (Prod-job SLO Preservation):** Đo lường mức ảnh hưởng của cơ chế overcommit lên tác vụ sản xuất. Mục tiêu là kiểm soát độ suy giảm thông lượng và độ trễ P99 của prod-job ở mức dưới 2%.
3. **Thời gian phản ứng can thiệp (Mitigation Reaction Latency):** Đo lường độ trễ từ lúc prod-job phát sinh đột biến tải đến khi Kalena hoàn tất việc bóp CPU (CFS throttle) hoặc gửi tín hiệu trục xuất (eviction) cho các batch-job.

### 4.3. Kịch bản và Môi trường thử nghiệm (Experimental Setup)

Quá trình đánh giá được chia thành hai phương thức bổ trợ:

* **Phát lại vết tải thực tế (Trace Replay):** Sử dụng các tập dữ liệu công khai từ các cụm máy chủ siêu lớn:
  * *Google Cluster Workload Traces* (các bản phát hành `clusterdata-2011-2` và `clusterdata-2019`), chứa hàng triệu sự kiện lập lịch và dữ liệu đo đạc tài nguyên thực tế.
  * *Alibaba Cluster Trace* (bộ dữ liệu `clusterdata` của Alibaba chứa cả tải microservices và tác vụ AI/Batch chạy chung trên cụm hỗn hợp).
* **Giả lập cụm quy mô lớn (Workload Simulation):**
  * Sử dụng công cụ **`kwok` (Kubernetes WithOut Kubelet)**: Giải pháp nhẹ cho phép mô phỏng hàng nghìn nút và hàng chục nghìn pod trên một máy tính cá nhân duy nhất với mức tiêu tốn CPU/RAM cực thấp.
  * Sử dụng **`kube-burner`** để tạo áp lực churn (liên tục tạo/xoá pod) và kịch bản tăng vọt tải (traffic spikes) nhằm đánh giá độ bền của scheduler plugin.

### 4.4. Giới hạn đã biết và Thách thức kỹ thuật (Known Limitations & Failure Modes)

Proposal xác định rõ ràng các hạn chế kỹ thuật nhằm định hình hướng giải quyết:

* **Độ trễ lấy mẫu của cAdvisor so với Borglet:** cAdvisor hoạt động theo chu kỳ quét định kỳ (mặc định từ 10-15 giây). Trong khi đó, Borglet ở hạ tầng của Google có thể phản ứng ở mức dưới một giây nhờ tích hợp sâu vào hệ điều hành. Khi một tác vụ sản xuất tăng đột biến nhu cầu RAM trong vài trăm mili-giây, cAdvisor có thể chưa kịp phát hiện để báo hiệu cho Kalena.
* **Nguy cơ OOM Killer của Linux:** Khi việc trục xuất các batch-job diễn ra không đủ nhanh trước tốc độ leo thang bộ nhớ của prod-job, Linux Kernel OOM Killer có thể bị kích hoạt. Trong tình huống xấu nhất, Kernel có thể chọn nhầm tiến trình của prod-job để tiêu diệt.
* **Giải pháp khắc phục định hướng (Mitigation Strategies):**
  * Ứng dụng ngưỡng mềm `memory.high` của cgroups v2 để hệ điều hành chủ động hãm tốc độ phân bổ bộ nhớ của batch-job trước khi chạm ngưỡng cứng `memory.max`.
  * Bổ sung cơ chế giám sát áp lực tức thời thông qua PSI (Pressure Stall Information) của Linux kernel bằng eventfd, kích hoạt trục xuất khẩn cấp mà không cần chờ chu kỳ quét của cAdvisor.

---

## 5. Kết luận & Lộ trình tiếp theo (Conclusion & Roadmap)

Kalena đóng vai trò mảnh ghép hoàn thiện chu trình điều phối tài nguyên cho hệ sinh thái Naughtian. Bằng cách kết hợp giữa kế hoạch ngoại tuyến của Kuberina và khả năng thu hoạch linh hoạt trực tuyến phỏng theo Google Borg, Kalena mang đến khả năng tối ưu hoá phần cứng tối đa mà vẫn giữ được chi phí vận hành (OpX) ở mức tối thiểu.

Các bước tiếp theo của dự án:
1. Xây dựng prototype ban đầu của plugin Kubernetes Scheduling Framework viết bằng Go.
2. Thiết lập môi trường thử nghiệm với `kwok` và tập dữ liệu mẫu Alibaba Cluster Trace.
3. Thử nghiệm cơ chế can thiệp cgroups v2 PSI để giải quyết bài toán trễ lấy mẫu.
