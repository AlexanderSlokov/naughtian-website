---
title: "Dự án Naughtian Kalena: Thu hồi Tài nguyên Trực tuyến và Đồng lập lịch Cơ hội"
description: "Đề xuất và thiết kế kiến trúc của Kalena: bộ lập lịch thu hồi tài nguyên khai thác dung lượng dôi dư trong hệ sinh thái Naughtian."
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
> **Định vị:** _Thu hồi tài nguyên trực tuyến và đồng lập lịch cơ hội cho các cụm tự quản (online resource reclamation and opportunistic co-scheduling)_
>
> **Tác giả:** _Dinh Tan Dung (ORCID: https://orcid.org/0009-0003-1374-7525)_
>
> **Trạng thái:** _Draft Proposal (2026)_

---

## Tóm tắt (Abstract)

Dung lượng cụm bị lãng phí theo hai trục độc lập. **Lãng phí không gian** là phân mảnh: workload nằm rải rác trên các node lấp đầy một phần, để lại dung lượng tổng mà không pod đơn lẻ nào dùng được. **Lãng phí thời gian** là dôi dư reservation: dung lượng được cấp phát đúng cho một workload và đơn giản là không được tiêu thụ tại thời điểm này. Trong hệ sinh thái Naughtian, Kuberina đã giải quyết bài toán thứ nhất. Trên benchmark MSC Irina của nó (186 node, 2.714 pod, 5.128 ràng buộc), Kuberina dồn về 152 trên 186 node và đạt mức tận dụng CPU trung bình 88,7% so với request đã khai báo, với zero vi phạm ràng buộc cứng, trong dưới 44 giây. Hạn chế mà chính Kuberina tự nêu cũng rõ ràng không kém: *"Kuberina không quan sát mức tiêu thụ tài nguyên thực tế. Các quyết định đặt chỗ của nó chỉ dựa trên request/limit đã khai báo, vốn có thể sai lệch so với hành vi sử dụng trong thực tế."*

Chúng tôi đề xuất **Kalena**, một bộ lập lịch thu hồi tài nguyên (reclamation scheduler) khép lại đúng khoảng trống đó, cho Kubernetes, Docker Standalone và Docker Swarm. Kalena thu thập viễn trắc từ cAdvisor và phân hệ Pressure Stall Information của nhân Linux, liên tục ước lượng một *reservation* cho từng container bằng mô hình suy giảm bất đối xứng phỏng theo Google Borg, và công bố phần chênh lệch giữa request mà Kuberina đã cam kết với mức sử dụng thực tế quan sát được dưới dạng dung lượng dôi dư có thể lập lịch. Việc kiềm chế tài nguyên được thực thi qua một vòng điều khiển ba tầng, tách biệt ước lượng chậm ở tầng tập trung khỏi giảm thiểu nhanh ở tầng node.

Kalena vận hành trên chính phần tài nguyên mà Kuberina cố ý chừa lại. Ở chế độ Pareto của Kuberina, dung lượng node bị giới hạn ở 80% trong lúc tối ưu trong khi blueprint được phát ra theo dung lượng thật, tạo ra một khoản dự trữ mang tính cấu trúc trên từng node: mức tận dụng node tối đa quan sát được là 79%, trung bình 74,6%, trên 182 node hoạt động. Khoản dự trữ đó không phải một sai sót cần giảm thiểu. Nó là headroom để burst mà tác vụ sản xuất đòi hỏi, và nó nằm không mỗi khi tác vụ sản xuất không burst. Mục tiêu của Kalena do đó được phát biểu là lượng dung lượng thu hồi được từ khoảng cách request-so-với-usage, thay vì một tỷ lệ tận dụng thô, vì con số tận dụng vốn đã là kết quả của Kuberina.

Mục tiêu thiết kế được phát biểu rõ ràng: tái hiện trung thực hành vi lập lịch và thu hồi tài nguyên mà Borg mô tả trong [Verma et al., EuroSys 2015], ở quy mô và ngân sách phức tạp vận hành của những người quản trị hạ tầng nằm ngoài các control plane siêu quy mô. Borg báo cáo rằng khoảng 20% khối lượng công việc trong một cell trung vị chạy hoàn toàn trên tài nguyên đã thu hồi. Con số đó là mục tiêu mà Kalena được thiết kế để đối chiếu.

---

## 1. Bối cảnh & Vấn đề

### 1.1. Hai loại lãng phí

Con số thường được trích dẫn rằng môi trường đám mây chỉ chạy ở mức tận dụng CPU trung bình 30-40% đã gộp chung hai thất bại khác biệt, và việc tách chúng ra chính là thứ xác định ranh giới giữa Kuberina và Kalena.

**Lãng phí không gian (phân mảnh).** `kube-scheduler` gán pod ngay khi chúng đến, theo thứ tự đến trước phục vụ trước. Theo thời gian, dung lượng trống của cụm vỡ vụn ra khắp các node lấp đầy một phần, và những workload mật độ cao nộp sau trở nên không lập lịch được dù tổng dung lượng vẫn đủ. Đây là một thất bại đặt chỗ tổ hợp, và nó được giải ngoại tuyến. Kuberina là lời giải của Naughtian.

**Lãng phí thời gian (dôi dư reservation).** Kỹ sư định cỡ request theo nhu cầu đỉnh dự phóng cộng biên an toàn. Một workload được cấp đúng 4 core cho đỉnh traffic chỉ tiêu thụ 0,6 core lúc 3 giờ sáng. Việc cấp phát không sai, và dung lượng vẫn nằm không. Đây là một thất bại ước lượng, nó không thể giải ngoại tuyến vì phụ thuộc vào quan sát lúc chạy, và đó là thứ Kalena xử lý.

Hai loại này trực giao với nhau. Một cụm đã chống phân mảnh hoàn hảo vẫn lãng phí dung lượng theo thời gian, và một cụm ước lượng mức sử dụng hoàn hảo vẫn bị phân mảnh. Tài liệu này giả định bài toán thứ nhất đã được giải và chỉ lập luận về bài toán thứ hai.

Khoảng cách thứ hai này đã được định lượng trong tài liệu Borg. Trong một cell Borg tiêu biểu, các job sản xuất được *cấp phát* khoảng 70% tổng tài nguyên CPU trong khi chỉ *chiếm* khoảng 60% tổng mức sử dụng CPU, và được cấp phát khoảng 55% tổng bộ nhớ. Chênh lệch giữa cấp phát và sử dụng chính là toàn bộ cơ sở kinh tế của việc thu hồi tài nguyên.

### 1.2. Những gì Kuberina đã hoàn thành

Kalena không được thiết kế để đối chiếu với một cụm ngây thơ. Nó được thiết kế để đối chiếu với đầu ra của Kuberina v0.2.0, và các sự kiện sau về đầu ra đó là nền móng chịu lực cho mọi mục tiếp theo.

| Năng lực đã có | Hệ quả cho Kalena |
| --- | --- |
| Mô hình MDBP 8 chiều: CPU, RAM, GPU, storage, disk read/write, net in/out | Kalena phải thu hồi trên đúng 8 chiều đó, và mỗi chiều có một lớp khả-thu-hồi khác nhau (Mục 2.4) |
| Đặt chỗ tính theo **requests**, không phải limits | Bất biến hai sổ cái phải phát biểu theo requests (Mục 2.3) |
| Phase 0 khấu trừ trước DaemonSet: $C_j^r$ là dung lượng cấp phát ròng | Dung lượng node của Kalena phải là đúng đại lượng sau khấu trừ đó, và DaemonSet không bao giờ bị trục xuất |
| Chế độ Pareto giới hạn tối ưu ở một tỷ lệ dung lượng trong khi phát blueprint theo dung lượng thật | Tồn tại một khoản dự trữ mang tính cấu trúc, trên từng node, cố ý không cấp phát. Đây là mảnh đất thu hoạch chính của Kalena |
| Ràng buộc topology spread với `maxSkew`, `topologyKey`, miền zone và rack | Việc đặt batch của Kalena không được làm mất hiệu lực độ trải mà blueprint đã đạt được |
| Đầu ra là một bảng ánh xạ (`namespace/pod: node`), phần render manifest được lên kế hoạch là `kuberina-forge` ở v0.3.0 | Kalena tiêu thụ bảng ánh xạ và Kuberina IR v0.2.0, không phải YAML đã render |
| Không có vòng phản hồi lúc chạy (hạn chế tự nêu, PAPER.md §8.1) | Kho lưu trữ mức sử dụng của Kalena là đầu vào còn thiếu, và cung cấp nó là một đóng góp chính |

Kết quả đã công bố trên benchmark MSC Irina, thứ mà Kalena dùng lại làm testbed của chính mình (Mục 6.5):

| Cấu hình | Node hoạt động | CPU trung bình | CPU node tối đa | Phương sai tận dụng | Thời gian chạy |
| --- | --- | --- | --- | --- | --- |
| Đóng gói đầy (100%) | 152 / 186 | 88,7% | 100% | 0,0374 | 43,67 s |
| Pareto 80% (Resource Canal) | 182 / 186 | 74,6% | 79% | 0,0256 | 43,71 s |

Cả hai cấu hình đều đặt được 100% pod với zero vi phạm về dung lượng, selector, hay gang, ở tỷ số xấp xỉ $\alpha = 1,34$ so với chặn dưới LP và $p < 10^{-4}$ so với 10.000 lần thử Monte Carlo đặt chỗ ngẫu nhiên.

### 1.3. Cái giá của việc tách cụm

Phương án thay thế thông thường cho co-location là tách vật lý: một cụm cho dịch vụ nhạy trễ, một cụm cho tính toán theo lô. Borg đã đo trực tiếp điều này qua thí nghiệm nén cell và phát hiện rằng tách riêng tác vụ sản xuất và phi sản xuất sang các cell khác nhau sẽ cần **thêm 20-30% số máy** ở cell trung vị. Chia nhỏ một cell lớn, hoặc cấp cell riêng cho từng tenant lớn, còn tốn kém hơn: phân vùng theo tenant vượt ngưỡng 10 TiB bộ nhớ sẽ cần số cell gấp 2-16 lần và thêm 20-150% số máy.

Do đó co-location là một thắng lợi về hiệu quả ngay cả trước khi tính đến nhiễu (interference) mà nó gây ra.

### 1.4. Khoảng trống kỹ thuật

Các nhà vận hành siêu quy mô xử lý lãng phí headroom bằng cách đồng lập lịch tác vụ sản xuất nhạy trễ ưu tiên cao chung với tác vụ theo lô ưu tiên thấp trên cùng phần cứng, như Google Borg đã tiên phong.

Hạ tầng tự quản, cụm biên và các triển khai vừa và nhỏ thiếu một cơ chế nhẹ, độc lập để thực hiện overcommitment cơ hội tương tự mà không phải gánh độ phức tạp vận hành của các add-on Kubernetes cấp doanh nghiệp hoặc control plane đám mây độc quyền.

---

## 2. Kiến trúc

Kalena hoạt động như một daemon và plugin lập lịch trực tuyến, tập trung vào việc thu hoạch dung lượng dôi dư một cách an toàn và động.

### 2.1. Môi trường mục tiêu

Kalena nhắm tới hai tầng vận hành:

* **Kubernetes (K8s):** triển khai như một plugin Kubernetes Scheduling Framework nguyên bản (mở rộng `Filter`, `Score`, và `Reserve`). Nó tiêm logic overcommitment vào bộ lập lịch cụm, đồng thời có thể vận hành như một secondary scheduler chuyên trách tác vụ cơ hội. Bản thân Borg cũng hội tụ về mô hình này, ghi nhận rằng họ "gần đây đã bổ sung khả năng cho Borg dùng các scheduler khác nhau cho các loại workload khác nhau."
* **Docker Standalone & Docker Swarm:** triển khai như một daemon lập lịch độc lập nhẹ, giao tiếp trực tiếp với Docker Engine API và Swarm manager API, phục vụ trực tiếp 80% triển khai tự vận hành không có cụm Kubernetes đầy đủ.

### 2.2. Viễn trắc qua cAdvisor và PSI

Kalena tiêu thụ hai kênh viễn trắc với vai trò khác nhau một cách có chủ đích:

* **cAdvisor (kênh chậm, đơn vị giây):** nguồn sự thật về mức tiêu thụ tài nguyên của từng container, cấp dữ liệu cho bộ ước lượng reservation. Trên Kubernetes, cAdvisor đã được nhúng sẵn trong mọi Kubelet, cung cấp metric container cục bộ với độ trễ tối thiểu. Trên node Docker và Swarm, cAdvisor chạy như một container nhẹ duy nhất. Kalena truy vấn cAdvisor trực tiếp, loại bỏ đường ống Prometheus bên ngoài hoặc exporter chuyên biệt.
* **Pressure Stall Information (kênh nhanh, dưới một giây):** giao diện PSI của nhân Linux, đăng ký qua `eventfd`, đẩy thông báo tranh chấp bộ nhớ và CPU mà không cần polling. Kênh này điều khiển enforcement, và không bao giờ điều khiển estimation.

Sự tách biệt này quan trọng. Chu kỳ polling mặc định 10-15 giây của cAdvisor là đủ để ước lượng một reservation suy giảm theo đơn vị phút, và không đủ để phản ứng với một cú tăng vọt bộ nhớ diễn ra trong vài mili giây. Mục 3.1 biến sự phân tách này thành cấu trúc.

### 2.3. Bất biến hai sổ cái (Dual-Ledger Invariant)

Đây là quy tắc kế toán trung tâm của hệ thống, và là tính chất khiến overcommitment trở nên an toàn.

Mỗi node duy trì **hai sổ cái tài nguyên độc lập**, và sổ cái được tra cứu phụ thuộc vào tầng (tier) của workload đang được đặt:

$$\text{Free}^{\text{prod}}_n = C_n - \sum_{i \in \mathcal{P}(n)} \text{req}_i$$

$$\text{Slack}_n(t) = C_n - \sum_{i \in \mathcal{P}(n)} R_i(t) - \sum_{j \in \mathcal{B}(n)} R_j(t)$$

trong đó $C_n$ là dung lượng node, $\mathcal{P}(n)$ và $\mathcal{B}(n)$ là tập workload sản xuất và workload theo lô đang cư trú trên node $n$, $\text{req}_i$ là request đã khai báo của workload $i$, và $R_i(t)$ là reservation hiện thời của nó. Mọi đại lượng đều là vector 8 chiều (Mục 2.4), và cả hai sổ cái phải đúng trên từng chiều một cách độc lập.

* **Việc đặt tác vụ sản xuất đọc sổ cái request.** Workload sản xuất được định cỡ theo request đã khai báo và không bao giờ nhìn thấy dung lượng thu hồi. Về mặt cấu trúc, chúng không thể bị lập lịch vào vùng đã oversubscribe. Workload theo lô bị loại hoàn toàn khỏi sổ cái này, vì chúng có thể bị trục xuất và do đó không cấu thành vật cản.
* **Việc đặt tác vụ theo lô đọc sổ cái reservation.** Workload cơ hội được định cỡ theo reservation trực tiếp, và đó chính là nơi dung lượng khai thác được xuất hiện.

Borg phát biểu quy tắc này trực tiếp: bộ lập lịch "dùng limit để tính feasibility cho prod task, nên chúng không bao giờ dựa vào tài nguyên thu hồi và không bị phơi nhiễm trước oversubscription; với non-prod task, nó dùng reservation của các task hiện hữu để task mới có thể được lập lịch vào tài nguyên thu hồi."

**Request, không phải limit.** Khái niệm *limit* của Borg gánh hai vai trò mà Kubernetes tách rời: nó vừa là đại lượng bộ lập lịch dùng để đóng gói, vừa là trần mà nhân thực thi. Kuberina đóng gói theo `requests` ($\text{req}_i^r$ trong định nghĩa hình thức của nó, và trường `requests:` trong Kuberina IR v0.2.0). Chép nguyên văn quy tắc Borg với `limits` của Kubernetes sẽ tạo ra hai sổ cái bất đồng với nhau, và tuyên bố về tính rời nhau ở dưới sẽ sai. Request do đó mới là sổ cái trên đúng đắn, còn limit chỉ tồn tại như trần thực thi ở Chương 3.

Điều này giải quyết một câu hỏi còn để ngỏ trong chính tài liệu thiết kế của Kuberina, vốn hỏi rằng solver nên đóng gói theo request, limit, hay cả hai. Quy tắc hai sổ cái trả lời: request định nghĩa phần bao đã đặt trước mà Kuberina đóng băng, limit định nghĩa trần burst mà Kalena giám sát, và khoảng cách giữa hai giá trị đó chính là vùng mà việc thu hồi vận hành.

**Bất biến khôi phục blueprint.** Đầu ra của Kuberina là một chứng minh khả thi: cho trước blueprint, mọi ràng buộc cứng đều thỏa. Kalena không được phép làm mất hiệu lực chứng minh đó. Bảo đảm được phát biểu dưới dạng một tính chất khôi phục:

> Tại bất kỳ thời điểm nào, việc trục xuất mọi workload theo lô trên node $n$ đưa node trở lại chính xác trạng thái tài nguyên mà blueprint của Kuberina quy định.

Điều này đúng vì workload theo lô chỉ xuất hiện trong sổ cái reservation và không bao giờ trong sổ cái request, và vì Kalena không bao giờ thay đổi vị trí của một workload sản xuất. Đó là ý nghĩa chính xác của việc hai hệ thống ghi vào trạng thái rời nhau, và là thứ đưa chi phí lập lịch runtime của tác vụ sản xuất về không.

**Dung lượng là đại lượng sau Phase 0.** $C_n$ là dung lượng cấp phát được của node *sau* khi Kuberina khấu trừ trước DaemonSet, $C_j^r = C_{j,\text{raw}}^r - \sum_d \mathbb{1}[\text{eligible}(d, n_j)] \cdot \text{res}_d^r$. Kalena đọc đúng giá trị đó. Dùng dung lượng thô sẽ ghi có cho Kalena phần slack mà các DaemonSet CNI, CSI, logging và monitoring vốn đã tiêu thụ, tạo ra đúng loại dung lượng ảo mà Phase 0 sinh ra để loại bỏ. Hệ quả trực tiếp là **workload DaemonSet không bao giờ bị Kalena trục xuất ở bất kỳ mức priority nào**: trong khung hàng hải chúng là nước dằn của con tàu, và tàu không bơm bỏ nước dằn để lấy chỗ cho hàng hóa.

### 2.4. Tính khả thu hồi trên tám chiều

Kuberina v0.2.0 mô hình hóa tài nguyên thành vector 8 chiều: CPU, RAM, GPU, storage, disk read, disk write, network in, network out. Việc mở rộng vượt khỏi bộ ba CPU/RAM/GPU ban đầu được thực hiện với mục đích tường minh là giảm thiểu hiệu ứng noisy-neighbor, vốn đúng là vấn đề mà co-location tạo ra. Kalena kế thừa vector này, và mỗi chiều rơi vào một trong ba lớp khả thu hồi.

| Chiều | Lớp | Cơ chế thực thi | Đóng góp slack |
| --- | --- | --- | --- |
| CPU | Nén được | CFS bandwidth control (`cpu.max`) | Có |
| Disk read, disk write | Nén được | Điều tiết `io.max` (blkio) | Có |
| Network in, network out | Nén được | Định hình egress qua tc/eBPF, giám sát ingress | Có |
| RAM | Không nén được | `memory.high` rồi trục xuất | Có |
| Storage | Không nén được | Thực thi quota rồi trục xuất | Có |
| GPU | Không thu hồi được | Không có | **Không** |

Bảng phân loại của chính Borg gọi "chu kỳ CPU, băng thông disk I/O" là nén được và "bộ nhớ, dung lượng đĩa" là không nén được, nên năm trong tám chiều của Kuberina ánh xạ thẳng vào các lớp của Borg. Phần mở rộng là việc Kalena giám sát băng thông mạng như một chiều nén được hạng nhất, điều mà bài báo Borg không bàn tới.

**GPU bị loại hoàn toàn khỏi việc thu hồi.** Một GPU được cấp cho workload qua device plugin là một phép gán nhị phân, không có nguyên thủy điều tiết nào tương đương CFS, không có đường preempt an toàn, và không có khái niệm tiêu thụ một phần có ý nghĩa trong mô hình device mặc định của Kubernetes. Một workload theo lô không thể mượn một GPU nhàn rỗi rồi nhả ra trong vài mili giây khi chủ sở hữu quay lại. Kalena do đó coi chiều GPU là cam kết toàn phần mọi lúc: $R_i^{\text{GPU}}(t) = \text{req}_i^{\text{GPU}}$ vĩnh viễn, đóng góp zero slack. Đây là lập trường trung thực, và nó quan trọng vì benchmark của Kuberina đặt 152 đơn vị GPU trên tổng số 240 khả dụng. Chia sẻ GPU cơ hội qua MPS, phân vùng MIG, hay time-slicing là một bài toán nghiên cứu riêng biệt và nằm ngoài phạm vi.

### 2.5. Ước lượng tài nguyên: Reservation

Reservation $R_i(t)$ là ước lượng thời gian thực của Kalena về phần bao đã khai báo mà một workload thực sự cần. Động lực học của nó bất đối xứng có chủ đích: chậm khi nhả tài nguyên, tức thì khi đòi lại.

Gọi $U_i(t)$ là mức sử dụng lấy mẫu từ cAdvisor với chu kỳ $T$, và $\lambda$ là hệ số biên an toàn. Định nghĩa mục tiêu tức thời:

$$\text{Target}_i(t) = U_i(t) \times (1 + \lambda)$$

Reservation khi đó tiến hóa theo:

$$
R_i(t) =
\begin{cases}
\text{req}_i, & t - t_i^{\text{start}} < T_{\text{grace}} \\[4pt]
\min\!\left(L_i,\ \text{Target}_i(t)\right), & \text{Target}_i(t) > R_i(t-1) \\[4pt]
\alpha R_i(t-1) + (1-\alpha)\,\text{Target}_i(t), & \text{trường hợp còn lại}
\end{cases}
$$

Bốn tính chất đáng nhấn mạnh, và ba tính chất đầu vắng mặt trong các bản nháp trước của đề xuất này:

1. **Reservation ban đầu bằng đúng request.** Một workload vừa được thu nhận được ghi có toàn bộ phần bao mà Kuberina đã cam kết cho nó trong blueprint. Nó đóng góp bằng không vào slack cho tới khi chứng minh được, qua mức sử dụng quan sát được, rằng nó không cần tới reservation đó. Chế độ hỏng mà quy tắc này ngăn chặn rất nghiêm trọng: một pod sản xuất vừa triển khai và chưa nhận traffic sẽ bị ước lượng ở mức sử dụng gần bằng không, request của nó bị giải phóng thành slack, và tác vụ theo lô lập tức được nhồi đè lên ngay trước khi tải của nó ập tới.

2. **Một khoảng ân hạn khởi động $T_{\text{grace}}$ vô hiệu hóa hoàn toàn việc ước lượng.** Borg giữ reservation bằng limit trong 300 giây "để chừa chỗ cho các dao động khởi động." Quá trình khởi động container bao gồm giải nén image, làm nóng JIT, thiết lập connection pool và nạp cache, và không quá trình nào trong số đó giống hành vi ở trạng thái ổn định. Kalena lấy 300 giây làm mặc định và cho phép cấu hình theo từng workload.

3. **Reservation có thể vượt lên trên request, và bị chặn trên bởi limit.** Một workload Burstable tiêu thụ vượt request của nó đang làm một việc hợp lệ, và phần dung lượng nó đang tiêu thụ phải ngừng được quảng bá là slack. Reservation do đó bám theo mức sử dụng đi lên xuyên qua request và dừng lại ở limit, chính là điểm mà bộ máy thực thi ở Chương 3 tiếp quản. Việc chặn tại $L_i$ cũng giữ cho sổ cái reservation không bao giờ vượt quá thứ mà nhân thực sự cho phép workload tiêu thụ.

4. **Suy giảm thì chậm, tăng thì tức thì.** Với $\alpha$ gần 1, dung lượng được nhả ra trong vài phút. Bất kỳ mẫu nào vượt quá reservation hiện thời đều nâng nó lên trong một bước duy nhất. Công thức decayed-maximum dùng ở bản nháp trước là trường hợp giới hạn của quy tắc này với biên an toàn đặt ngoài toán tử max, và dạng hàm mũ được ưu tiên ở đây vì nó cho phép hiệu chỉnh $\alpha$ và $\lambda$ độc lập với nhau.

Cả $\alpha$ lẫn $\lambda$ đều không được công bố trong tài liệu Borg. Trong đề xuất này, cả hai được xử lý như tham số cần hiệu chỉnh thực nghiệm, và Mục 6.4 quy định giao thức.

**Cửa thoát cho việc ước lượng.** Borg cấp cho người dùng có đặc quyền một capability để tắt hoàn toàn resource estimation trên job của họ. Kalena cung cấp cơ chế tương đương qua annotation `kalena.naughtian.io/reclaim: disabled`, ghim vĩnh viễn $R_i(t) = \text{req}_i$. Với những workload có hành vi burst bệnh lý hoặc không đo được, loại trừ vẫn tốt hơn là mô hình hóa sai. Chiều GPU được ghim theo cách này một cách vô điều kiện cho mọi workload (Mục 2.4).

### 2.6. Phân loại workload: Hai trục trực giao

Borg tách bạch hai mối quan tâm thường bị gộp làm một. Kalena áp dụng đúng sự tách bạch đó.

* **Tier (lớp cách ly).** Quyết định workload được bộ máy enforcement đối xử *như thế nào*: có được tiêu thụ slack hay không, có bị trục xuất hay không, và chính sách cgroup nào áp dụng. Hai giá trị: `service` và `batch`. Tương ứng với phân biệt *appclass* của Borg giữa latency-sensitive và batch.
* **Priority (thứ tự trục xuất).** Một số nguyên không âm nhỏ, quyết định workload *nào* bị hy sinh trước khi có tranh chấp. Tương ứng với *priority band* của Borg.

Hai trục độc lập với nhau. Một batch job ưu tiên cao vẫn bị throttle và vẫn có thể bị trục xuất, và đơn giản là chết sau cùng trong nhóm batch. Điều này trở nên quan trọng ngay khi người vận hành chạy nhiều hơn một loại tác vụ cơ hội: một bản build CI mà lập trình viên đang chờ và một tác vụ reindex ban đêm đều là `batch`, và chúng không nên có mức độ có thể vứt bỏ ngang nhau.

Kalena kế thừa thêm một quy tắc nữa từ Borg: **workload thuộc tier service không được quyền preempt lẫn nhau.** Borg đưa ra ràng buộc này để loại bỏ preemption cascade, khi một task ưu tiên cao đẩy một task ưu tiên thấp hơn một chút ra, task này lại đẩy một task khác, và cứ thế lan truyền. Việc đặt tác vụ sản xuất trong hệ sinh thái Naughtian là blueprint của Kuberina, và một cascade lúc runtime sẽ làm blueprint đó mất hiệu lực.

### 2.7. Chính sách tiêu thụ slack

Việc một workload có được phép vượt limit của chính nó để tiêu thụ slack chưa ai dùng hay không được điều khiển bởi hai núm riêng biệt với **mặc định bất đối xứng có chủ đích**, theo kinh nghiệm vận hành của Borg:

| Tài nguyên | Mặc định | Lý do |
| --- | --- | --- |
| Slack CPU | **bật** | CPU nén được. Hậu quả của việc tiêu thụ quá mức là bị throttle, làm giảm thông lượng và giữ nguyên tính đúng đắn. |
| Slack memory | **tắt** | Bộ nhớ không nén được. Tiêu thụ slack memory làm tăng đáng kể xác suất bị giết. |

Borg báo cáo rằng dưới các mặc định này, dưới 1% batch task tắt slack CPU, trong khi 79% batch task chủ động bật slack memory, phần lớn vì framework MapReduce bật sẵn nó. Bài học là mặc định bảo thủ mới đúng, và đường opt-in phải chỉ gói gọn trong một trường, vì các framework hiểu rõ ngữ nghĩa restart của chính mình sẽ dùng nó một cách phổ quát.

```yaml
metadata:
  labels:
    kalena.naughtian.io/tier: batch
  annotations:
    kalena.naughtian.io/priority: "20"
    kalena.naughtian.io/slack-memory: "allow"   # mặc định: deny
    kalena.naughtian.io/slack-cpu: "allow"      # mặc định: allow
```

### 2.8. Mặc định không ma sát

Để bảo toàn Trải nghiệm Vận hành (OpX), Kalena tối thiểu hóa chi phí soạn manifest:

* **Mặc định an toàn:** mọi workload không khai báo phân loại đều được coi là `tier: service` với cách ly đầy đủ và không có rủi ro bị trục xuất bất ngờ.
* **Cú pháp tối giản:** phân loại một workload thành tác vụ thu hoạch cơ hội chỉ cần đúng một label. Mọi trường khác trong ví dụ trên đều là tùy chọn.
* **Suy luận tự động:** khi được bật, Kalena tự động phân loại các đối tượng `Job` và `CronJob` chuẩn của Kubernetes thành `tier: batch` mà không cần sửa manifest.

---

## 3. Thực thi và Cách ly

### 3.1. Tách vòng điều khiển: ước lượng chậm, thực thi nhanh

Quyết định cấu trúc quan trọng nhất trong Kalena là **đường ước lượng và đường thực thi là hai vòng điều khiển tách biệt, với ngân sách độ trễ riêng và nguồn dữ liệu riêng.**

Borg thiết lập mô hình này. Reservation được tính tập trung tại Borgmaster vài giây một lần, từ mức sử dụng do Borglet báo cáo, với chu kỳ polling Borglet có phân vị 95 dưới 10 giây. Vậy mà khi một máy cạn tài nguyên không nén được, "Borglet lập tức chấm dứt các task." Quyết định giết không hề đi qua đường ống ước lượng.

Kalena định nghĩa ba tầng:

| Tầng | Ngân sách độ trễ | Kích hoạt | Chủ thể | Hành động |
| --- | --- | --- | --- | --- |
| **Ước lượng** | giây | mẫu cAdvisor | Node agent, công bố lên control plane | Cập nhật $R_i(t)$, tính lại slack node, công bố |
| **Giảm thiểu** | dưới một giây | PSI `eventfd`, vượt `memory.high` của cgroups v2 | Node agent, tự chủ | Throttle qua CFS bandwidth control; trục xuất batch cục bộ |
| **Leo thang** | hàng chục giây | Giảm thiểu cục bộ không hội tụ | Control plane | Rút toàn bộ batch khỏi node; đánh dấu node không đủ tư cách nhận slack |

Tầng leo thang phản chiếu hành vi của Borg khi throttle cục bộ không đủ: "Nếu tình hình không cải thiện, Borgmaster sẽ gỡ một hoặc nhiều task khỏi máy đó." Một node chịu áp lực kéo dài mà giảm thiểu cục bộ không giải quyết được là một node nên ngừng nhận tác vụ cơ hội hoàn toàn, và đó là quyết định ở cấp cụm.

Sự phân tách này chính là câu trả lời trực tiếp cho phản biện về độ trễ lấy mẫu. Độ chính xác của bộ ước lượng bị chặn bởi chu kỳ polling của cAdvisor. **Tính an toàn** của hệ thống bị chặn bởi độ trễ thông báo PSI, vốn dưới một giây, vì các quyết định an toàn được đưa ra trên kênh nhanh.

### 3.2. Phân loại tài nguyên và phản ứng

Kalena phản ứng theo lớp khả thu hồi của chiều đang chịu áp lực, như bảng ở Mục 2.4:

* **Chiều nén được (CPU, disk read, disk write, network in, network out):** dựa trên tốc độ, có thể thu hồi khỏi workload bằng cách hạ chất lượng dịch vụ mà không cần giết nó. Khi có tranh chấp, Kalena throttle workload cơ hội, ưu tiên cho workload tier service.
* **Chiều không nén được (bộ nhớ, storage):** nhìn chung không thể thu hồi mà không chấm dứt workload. Khi áp lực vượt ngưỡng, Kalena trục xuất workload theo lô.
* **Chiều không thu hồi được (GPU):** không bao giờ bị oversubscribe, do đó không bao giờ là nguồn tranh chấp mà Kalena phải giải quyết.

Tranh chấp được đánh giá theo từng chiều, và phản ứng là bất cứ điều gì lớp của chiều đó quy định. Một node bão hòa egress mạng trong khi CPU và bộ nhớ vẫn nằm thoải mái dưới reservation sẽ kích hoạt định hình egress trên workload theo lô và không gì khác. Độ mịn này là lợi ích thực tiễn của việc Kuberina mở rộng lên 8 chiều, vốn tự thân được thúc đẩy bởi mục tiêu giảm noisy-neighbor: một batch job nặng I/O bỏ đói băng thông đĩa của một database sản xuất là thứ vô hình với mô hình thu hồi chỉ có CPU và bộ nhớ, và đó đúng là thất bại mà co-location bị quy trách nhiệm.

Riêng về cơ chế CPU, Borg ghi nhận một phát hiện đáng giữ lại: **chỉ dùng cgroup shares là không đủ.** Vì hệ thống hỗ trợ nhiều mức ưu tiên thay vì một phân biệt nhị phân duy nhất, Borg "áp dụng CFS bandwidth control có chọn lọc khi cần" bên cạnh shares. Phân loại hai trục của Kalena (Mục 2.6) tạo ra đúng cấu trúc đa mức đó, và do đó kế thừa đúng yêu cầu đó. Shares biểu diễn quyền hưởng theo tỷ lệ; bandwidth control biểu diễn trần cứng. Cả hai đều cần thiết.

Các nguyên thủy tương đương cho những chiều nén được còn lại kém trưởng thành hơn và được nêu ra như một rủi ro triển khai. Điều tiết block I/O qua `io.max` của cgroups v2 đòi hỏi cấu hình theo từng thiết bị và hành xử không nhất quán giữa các tầng filesystem và device-mapper. Định hình mạng thì hoàn toàn không có controller cgroups v2: egress cần queueing discipline của `tc` hoặc eBPF gắn theo từng network namespace, còn ingress chỉ có thể giám sát chứ không định hình được. Bản triển khai đầu tiên của Kalena thực thi CPU và bộ nhớ với độ trung thực đầy đủ, và coi các chiều đĩa và mạng là **có hạch toán nhưng chỉ mang tính tham khảo**, nghĩa là chúng tham gia vào chấm điểm đặt chỗ và thứ tự trục xuất, còn phần thực thi thuộc về một mốc phát hành sau.

Borg còn dành riêng nguyên các core vật lý cho task nhạy trễ và áp dụng ghim `cpuset` một cách dè dặt cho ứng dụng có yêu cầu độ trễ đặc biệt khắt khe. Kalena cung cấp cơ chế tương đương qua chính sách static CPU manager của Kubernetes cho các workload tier service có khai báo, trong khi workload theo lô vẫn được phép chạy trên bất kỳ core nào với shares tối thiểu.

### 3.3. Thứ tự trục xuất và điều kiện dừng

Khi một node cạn tài nguyên không nén được, Kalena trục xuất **từ ưu tiên thấp nhất lên cao dần, cho tới khi các reservation còn lại được đáp ứng.**

Điều kiện dừng được phát biểu theo sổ cái reservation thay vì theo một ngưỡng free-bytes. Đây là kế thừa có chủ đích từ Borg, và nó mang một tính chất hữu ích: vòng lặp trục xuất kết thúc dựa trên chính đại lượng mà bộ ước lượng duy trì, nên đường thực thi và đường ước lượng không thể bất đồng về thời điểm node đã khỏe mạnh trở lại.

$$\text{trục xuất cho tới khi} \quad \sum_{i \in \mathcal{P}(n) \cup \mathcal{B}(n)} R_i(t) \le C_n \quad \text{trên chiều đang chịu áp lực}$$

Vì $\mathcal{B}(n)$ hữu hạn và mọi workload theo lô đều có thể trục xuất, vòng lặp này luôn kết thúc. Trường hợp xấu nhất là tập batch rỗng, tại đó node đã được khôi phục chính xác về trạng thái blueprint của Kuberina, và bất biến khôi phục ở Mục 2.3 bảo đảm trạng thái đó khả thi. **Kalena do đó không bao giờ có thể trục xuất tới mức tạo ra một cụm bất khả thi**, và đó là tính chất cho phép nó vận hành mà không cần góc nhìn toàn cục.

**DaemonSet nằm ngoài tập trục xuất.** Chúng đã được khấu trừ khỏi $C_n$ ở Phase 0 của Kuberina và không phải biến quyết định trong sổ cái nào cả. Trục xuất một DaemonSet sẽ làm giảm chính năng lực vận hành của node, trong khung hàng hải là bơm bỏ nước dằn để lấy chỗ cho hàng hóa, và node agent của Kalena loại trừ chúng vô điều kiện bất kể số priority chúng mang.

**Ngoại lệ vượt limit.** Một quy tắc duy nhất được ưu tiên trên toàn bộ thứ tự priority: *một workload vượt quá memory limit của chính nó sẽ bị trục xuất đầu tiên, bất kể tier hay priority.* Borg phát biểu điều này thẳng thắn, và lập luận là một workload tiêu thụ vượt ngoài phạm vi đã khai báo đã tự đánh mất bảo đảm mà phạm vi đó mua cho nó. Không có quy tắc này, một pod tier service bị rò rỉ bộ nhớ sẽ được tier của nó che chở trong khi kernel OOM killer chọn nạn nhân theo heuristic riêng, và đó chính xác là kết cục mất kiểm soát mà hệ thống này sinh ra để ngăn chặn.

Dữ liệu vận hành của Borg ủng hộ hiệu lực của quy tắc: vì kẻ vượt memory limit bị preempt trước bất kể priority, "hiếm khi có task vượt memory limit của mình." Quy tắc này chủ yếu mang tính răn đe.

### 3.4. Chống bỏ đói và bảo đảm tiến triển

Một chính sách preemption trong đó tác vụ sản xuất luôn thắng tuyệt đối sẽ tạo ra những workload theo lô không bao giờ hoàn thành. Borg không cài đặt chính sách như vậy:

> "Borglet điều chỉnh động các resource cap của những LS task tham lam nhằm bảo đảm chúng không bỏ đói batch task trong nhiều phút liền."

Kalena áp dụng một bảo đảm bỏ đói có chặn. Node agent theo dõi tổng thời gian bị throttle của từng workload theo lô. Khi một workload theo lô bị throttle vượt quá $T_{\text{starve}}$ trong một cửa sổ trượt, agent áp trần băng thông lên các workload tier service trên node đó, đủ để giải phóng một mức cấp phát CPU tối thiểu cho workload theo lô.

Trần này chỉ áp lên các workload tier service có mức tiêu thụ vượt quá reservation của chính chúng, nghĩa là bản thân chúng cũng đang chạy trên slack. Một workload sản xuất hoạt động trong phạm vi reservation của mình không bao giờ bị áp trần. Bảo đảm do đó đọc là: *tác vụ cơ hội có thể bị bỏ đói bởi nhu cầu thực của tác vụ sản xuất, và không thể bị bỏ đói vô hạn bởi lòng tham của tác vụ sản xuất.*

### 3.5. Preemption có báo trước

Workload bị trục xuất nhận `SIGTERM` trước `SIGKILL`, với một độ trễ có chặn, cho phép chúng checkpoint trạng thái, hoàn tất các request đang xử lý và từ chối request mới. Trên Kubernetes điều này ánh xạ sang `terminationGracePeriodSeconds`.

Đề xuất này phát biểu giới hạn một cách trung thực, như Borg đã làm: thông báo chỉ là best-effort. Borg báo cáo rằng trên thực tế thông báo trước được gửi tới khoảng 80% số lần, và khoảng thời gian báo trước thực tế có thể bị rút ngắn khi bên preempt đặt delay bound chặt hơn. Dưới áp lực bộ nhớ cấp tính, Kalena sẽ chấm dứt workload mà không có grace period sử dụng được, vì phương án thay thế là một cú OOM kill của kernel vốn không cho gì cả. Workload theo lô phải được viết để chịu được việc bị chấm dứt đột ngột.

---

## 4. Bộ lập lịch Kalena

### 4.1. Chấm điểm đặt chỗ

Plugin `Score` của Kalena xếp hạng các node khả thi cho workload cơ hội. Mô hình chấm điểm phỏng theo Borg, vốn không phải best-fit cũng không phải worst-fit.

Borg ghi nhận sự thất bại của cả hai thái cực. Chấm điểm E-PVM xấp xỉ worst-fit, trải tải ra khắp các máy và chừa headroom cho spike, với cái giá là phân mảnh tăng lên đối với các task lớn. Best-fit nhồi chặt và để trống hẳn một số máy, giúp việc đặt task lớn trở nên đơn giản, nhưng "trừng phạt mọi sai lệch trong ước lượng nhu cầu tài nguyên" và "đặc biệt tệ với các batch job vốn khai báo nhu cầu CPU thấp để dễ được lập lịch rồi cố chạy cơ hội trong tài nguyên nhàn rỗi." Borg lưu ý 20% task phi sản xuất yêu cầu dưới 0.1 CPU core, và đó chính xác là hình dạng workload mà Kalena được xây để đặt chỗ.

Mô hình sản xuất của Borg là một mô hình lai, tối thiểu hóa **tài nguyên bị kẹt (stranded resources)**, tức dung lượng không dùng được vì một chiều tài nguyên khác trên cùng máy đã cấp phát hết. Họ báo cáo hiệu quả đóng gói tốt hơn best-fit 3-5%.

Điểm số của Kalena gồm bốn thành phần:

1. **Tối thiểu hóa slack bị kẹt.** Ưu tiên các node mà sau khi đặt workload này, vector slack còn lại vẫn cân đối trên bảy chiều khả thu hồi. Một node còn 8 core slack và 200 MiB bộ nhớ trống thì 8 core đó bị kẹt. Hàm fitness của Kuberina chứa một số hạng $f_{\text{frag}}$ có cấu trúc y hệt trên cùng vector đó, và hai hệ thống giải cùng một bài toán hình học trên hai sổ cái khác nhau.
2. **Ưu tiên co-location.** Ưu tiên các node đã có sẵn hỗn hợp workload tier service và tier batch. Điều này nghe phản trực giác và được nêu thẳng trong tiêu chí chấm điểm của Borg: "đặt hỗn hợp task ưu tiên cao và thấp lên cùng một máy để task ưu tiên cao có chỗ giãn nở khi tải tăng vọt." Dồn batch lên đúng những node đang gánh tác vụ sản xuất chính là cơ chế giúp tác vụ sản xuất giữ được chỗ để burst, vì batch là phần dằn nén được sẽ nhường lại.
3. **Image locality.** Trọng số cao, vì lý do trình bày ở Mục 4.3.
4. **Phạt biến động.** Phạt những node có chuỗi reservation biến thiên mạnh trong cửa sổ gần đây. Một node có tải sản xuất ổn định là chỗ trú tốt hơn cho tác vụ cơ hội so với một node có cùng slack trung bình nhưng hình dáng gai góc.

**Bộ lọc bảo toàn blueprint.** Chấm điểm chỉ xếp hạng các node vốn đã khả thi, và tính khả thi cho một workload theo lô mang thêm hai ràng buộc ngoài sổ cái reservation, cả hai đều kế thừa từ những gì Kuberina đã mã hóa vào blueprint:

* **Anti-affinity của tác vụ sản xuất ràng buộc Kalena.** Một workload sản xuất khai báo `antiAffinity` đối với một lớp workload là để tránh xung đột về nhiễu hoặc về tính đúng đắn, và ý định đó không yếu đi chỉ vì pod gây xung đột đến qua đường thu hồi thay vì qua blueprint. Bộ `Filter` của Kalena đánh giá các mục tiêu anti-affinity của mọi workload sản xuất đang cư trú so với pod batch ứng viên, và loại node khi khớp.
* **Topology spread không phải thứ Kalena được tiêu thụ.** Kuberina đạt được một chặn `maxSkew` trên các miền `topologyKey` bao gồm zone và rack, và nó xử lý spread như một hình phạt mềm trong hàm fitness. Các pod batch mang ràng buộc spread của riêng chúng được đánh giá trên cùng các miền đó, và Kalena không bao giờ tính một pod batch vào skew của một workload sản xuất, vì việc trục xuất nó sau này sẽ âm thầm thay đổi độ skew mà blueprint đã được duyệt trên đó.

Quy tắc tổng quát: **Kalena được phép chiếm dụng dung lượng mà blueprint để không, và không được phép tiêu thụ ngân sách ràng buộc mà blueprint đã chi.**

### 4.2. Kỹ thuật mở rộng quy mô

Borg báo cáo rằng lập lịch toàn bộ workload của một cell từ đầu mất vài trăm giây khi bật các kỹ thuật dưới đây, và **không hoàn thành sau hơn ba ngày khi tắt chúng đi.** Kalena vận hành ở quy mô nhỏ hơn và trên một bài toán hẹp hơn, và các kỹ thuật này vẫn đủ rẻ để đáng cài đặt.

* **Cache điểm với invalidation thô.** Kết quả feasibility và scoring được cache theo node và bị vô hiệu khi trạng thái thay đổi. Borg ghi nhận tinh chỉnh thiết yếu: "bỏ qua các thay đổi nhỏ về lượng tài nguyên giúp giảm số lần invalidate cache." Điều này có tính sống còn với Kalena theo cách nó không có với Borg, vì reservation của Kalena dịch chuyển liên tục theo dao động của mức sử dụng. Không lượng tử hóa thì mỗi mẫu cAdvisor sẽ xóa sạch cache. Kalena do đó khóa cache theo một giá trị slack đã lượng tử hóa:

  $$\widetilde{\text{Slack}}_n = \Delta \left\lfloor \text{Slack}_n / \Delta \right\rfloor$$

  với bề rộng bucket $\Delta$ đặt riêng cho từng chiều tài nguyên. Chỉ khi vượt qua biên bucket thì điểm cache của node mới bị vô hiệu.

* **Lớp tương đương (equivalence classes).** Feasibility và scoring được tính một lần cho mỗi nhóm workload có yêu cầu và ràng buộc giống hệt nhau, thay vì một lần cho mỗi workload. Trong Kubernetes điều này ánh xạ gọn ghẽ sang các pod thuộc cùng `Job`, `CronJob`, hoặc `ReplicaSet`, vốn theo cấu trúc dùng chung một pod template.

* **Ngẫu nhiên hóa nới lỏng.** Với các cụm đủ lớn để việc chấm điểm mọi node trở nên lãng phí, Kalena duyệt node theo thứ tự ngẫu nhiên cho tới khi chấm đủ một số lượng ứng viên khả thi, rồi chọn ứng viên tốt nhất trong mẫu đó. Borg lưu ý cách làm này gần với batch sampling của Sparrow, đồng thời còn xử lý được priority, preemption, tính không đồng nhất và chi phí khởi động.

* **Điều khiển tương tranh lạc quan trên một bản sao cache.** Với tư cách một secondary scheduler, Kalena nhất thiết vận hành trên bản sao cache của trạng thái cụm, đề xuất các binding mà API server có thể từ chối vì đã cũ. Borg đi tới cùng kiến trúc đó vì cùng lý do và coi việc bị từ chối là bình thường: các phép gán mà master thấy không phù hợp "sẽ được xem xét lại ở lượt kế tiếp của scheduler."

### 4.3. Chi phí khởi động và thời gian nguội sau trục xuất

Borg đo được độ trễ khởi động task trung vị khoảng 25 giây, trong đó **cài đặt package chiếm khoảng 80%.** Tương đương trong Kubernetes là image pull, và phép tính rất phũ phàng: một workload cơ hội mất 25 giây để chạy được rồi bị trục xuất sau 10 giây thì không làm được việc gì trong khi vẫn tiêu thụ tài nguyên thật. Một reclamation scheduler ngây thơ dưới tải sản xuất dao động sẽ rơi vào thrashing.

Kalena áp dụng ba biện pháp giảm thiểu:

1. **Trọng số image locality cao.** Bộ lập lịch của Borg "ưu tiên gán task cho các máy đã có sẵn package cần thiết," và phân phối package bằng giao thức dạng cây và dạng torrent. Kalena đặt trọng số tín hiệu `ImageLocality` của Kubernetes cao hơn hẳn mặc định, chấp nhận điểm đóng gói kém hơn để đổi lấy một workload khởi động nhanh hơn một bậc độ lớn.
2. **Thời gian chạy tối thiểu.** Một workload theo lô đã chạy dưới $T_{\text{min}}$ được miễn trục xuất, trừ khi node đang chịu áp lực không nén được ở mức cấp tính, khi đó tính đúng đắn được ưu tiên trên hiệu quả.
3. **Thời gian nguội và danh sách chặn cặp ghép.** Một workload bị trục xuất khỏi node $n$ sẽ không đủ tư cách được lập lịch lại lên $n$ trong một khoảng nguội. Đây là dạng tổng quát hóa của quy tắc khả dụng trong Borg, rằng hệ thống "tránh lặp lại các cặp task::machine từng gây crash task hoặc crash máy," và nó phá vỡ đúng cái bệnh lý mà một batch pod cứ bị đặt đi đặt lại lên đúng node sắp có tải sản xuất tăng vọt.

### 4.4. Ngữ nghĩa xếp hàng lại và xử lý lỗi

Kalena chủ động không cài đặt migration hay checkpoint-restore. Workload bị trục xuất được trả về hàng đợi pending và được lập lịch lại từ đầu. Borg chọn y hệt và ghi lại điều đó trong một chú thích chân trang duy nhất, với đúng một ngoại lệ được nêu tên dành cho các task cung cấp máy ảo. Độ phức tạp của live migration không xứng đáng với những workload vốn dĩ đã bắt buộc phải chịu được việc bị chấm dứt.

Kalena kế thừa thêm hai hành vi giới hạn tốc độ từ thiết kế khả dụng của Borg:

* **Việc lập lịch lại từ các node không liên lạc được bị giới hạn tốc độ,** vì bộ lập lịch không phân biệt được hỏng hóc node quy mô lớn với một sự cố phân mảnh mạng, và một cơn giẫm đạp trong trường hợp sau là thiệt hại tự gây ra.
* **Giới hạn tốc độ gián đoạn và số bản sao đồng thời ngừng hoạt động** được áp theo từng nhóm workload, để một sự kiện thu hồi không thể hạ toàn bộ replica của một batch service cùng một lúc.

### 4.5. Kiểm soát thu nhận

Câu trả lời của Borg cho việc công việc đến nhiều hơn sức chứa của cụm là quota áp ở khâu thu nhận thay vì ở khâu lập lịch: "các job không đủ quota bị từ chối ngay khi nộp." Quota được định giá theo priority, quota ở mức priority sản xuất bị chặn ở lượng tài nguyên vật lý sẵn có trong cell, và **mọi người dùng đều có quota gần như vô hạn ở priority bằng không**, vốn được thu nhận thoải mái và thường xuyên nằm chờ mãi.

Kalena áp dụng một dạng đơn giản hóa phù hợp với quy mô của mình. Workload theo lô được thu nhận mà không kiểm tra dung lượng và có thể nằm pending vô thời hạn, vốn đã là hành vi nguyên bản của Kubernetes. Người vận hành có thể tùy chọn cấu hình một trần số lượng workload theo lô đang *chạy* đồng thời cho mỗi namespace, giới hạn bán kính ảnh hưởng của một tenant duy nhất làm bão hòa slack toàn cụm. Việc định giá quota tinh vi được tuyên bố rõ là nằm ngoài phạm vi, vì nó giải quyết một bài toán đa tenant mà các cụm tự quản phần lớn không gặp phải.

---

## 5. Vị thế trong Hệ sinh thái: Cộng sinh với Kuberina

### 5.1. Mô hình "Đá tảng và Dòng chảy"

Trong thần thoại Naughtian, Kalena và Kuberina là bạn đồng hành. Về mặt kiến trúc, chúng tạo thành một hệ lập lịch hai tầng theo hai thang thời gian:

* **Kuberina (tiền hoạch định ngoại tuyến):** kiến trúc sư hải cảng. Kuberina tính toán vị trí xếp dỡ của các container hàng nặng (workload sản xuất) lên các tọa độ thân tàu cố định trước khi tàu rời bến.
* **Kalena (tinh chỉnh động trực tuyến):** thủy thủ đoàn trong hải trình. Kalena nhét các kiện hàng nhẹ (workload theo lô) vào các khe hở giữa container khi đang trên biển, và ném bớt hàng nhẹ xuống khi bão đe dọa sự ổn định của tàu.

Mô hình lai này mang lại ba tính chất kiến trúc:

1. **Đường cơ sở độ trễ bằng không:** workload sản xuất có vị trí (`nodeName`) được Kuberina quyết định tĩnh trong blueprint YAML, đưa chi phí lập lịch runtime của tác vụ sản xuất về 0 ms.
2. **Lập lịch runtime tập trung:** Kalena chỉ tiêu tốn chu kỳ lập lịch cho việc nhồi tác vụ cơ hội vào phần headroom chưa được khai thác.
3. **Phản hồi vòng kín:** Kalena ghi lại hồ sơ tiêu thụ thực nghiệm theo thời gian và xuất viễn trắc này ngược về Kuberina. Các chu kỳ hoạch định sau sẽ dùng phân phối thực nghiệm để siết chặt biên bin-packing.

### 5.2. Kalena và Resource Canal

Bài báo của chính Kuberina đã đặt tên cho mối cộng sinh mà nó kỳ vọng với các hệ thống lúc chạy, và Kalena phải được định vị đối chiếu với khái niệm sẵn có đó thay vì đứng song song với một khái niệm cạnh tranh.

Kuberina mô tả **Hiệu ứng Resource Canal**: tối ưu MDBP ngoại tuyến thiết lập các biên vật lý cố định, tức bờ kênh, và các hệ thống động sau đó vận hành bên trong chúng, điều chỉnh theo lưu lượng thời gian thực, tức mực nước. Ví dụ được bài báo nêu tên là Google Autopilot và Vertical Pod Autoscaler, và lập luận của nó là một hàm chi phí RL vận hành bên trong một kênh do Kuberina định nghĩa sẽ hội tụ nhanh hơn vì các cực trị vượt ngưỡng và hụt ngưỡng đã bị loại bỏ từ trước.

Kalena chiếm đúng cái kênh đó và làm một việc khác hẳn về bản chất bên trong nó.

| | Autopilot / VPA | Kalena |
| --- | --- | --- |
| Tác động lên | Phần bao của chính workload sản xuất | Workload của người khác |
| Hướng | Dọc: nâng hoặc hạ request | Ngang: nạp một workload lạ vào phần không gian chưa dùng |
| Ảnh hưởng tới blueprint | Thay đổi `requests`, làm mất hiệu lực chứng minh khả thi của Kuberina cho tới khi hoạch định lại | Giữ nguyên `requests` (bất biến khôi phục ở Mục 2.3) |
| Chế độ hỏng | Cấp thiếu gây OOM cho chính workload sản xuất | Thu hoạch quá tay gây trục xuất batch, tác vụ sản xuất không bị ảnh hưởng |
| Quan hệ với con kênh | Điều chỉnh bề rộng của bờ kênh | Dùng phần nước mà bờ kênh hiện không chứa |

Sự phân biệt này quan trọng vì hai cách tiếp cận không thay thế được cho nhau và có thể chạy đồng thời. Một vertical autoscaler rốt cuộc buộc phải hoạch định lại Kuberina, vì nó thay đổi chính đại lượng mà blueprint đã đóng gói theo. Kalena thì không bao giờ, và đó là lý do nó có thể vận hành liên tục giữa các chu kỳ hoạch định.

**Khoản dự trữ Pareto chính là con kênh, được cụ thể hóa.** Cờ `--pareto` của Kuberina giới hạn dung lượng node trong lúc tối ưu trong khi phát blueprint theo dung lượng thật, nên khoản dự trữ không phải một tính chất phát sinh để hy vọng. Trên benchmark Irina ở `--pareto 80`, kết quả là mức tận dụng node tối đa 79% và trung bình 74,6%, tức một khoản dự trữ được bảo đảm và định lượng trên từng node trong số 182 node hoạt động. Khoản dự trữ này tốn 30 node so với đóng gói đầy (182 node hoạt động thay vì 152), và nó mua lại được sự cân bằng tốt hơn có thể đo lường: phương sai tận dụng giảm từ 0,0374 xuống 0,0256 và số vi phạm affinity mềm giảm từ 643 xuống 549.

Kalena thay đổi bài toán kinh tế của phép đánh đổi đó. Không có tầng thu hồi, khoản dự trữ Pareto là bảo hiểm thuần túy, trả phí liên tục và chỉ được dùng khi burst. Có Kalena, khoản dự trữ mang theo tác vụ cơ hội mỗi khi tác vụ sản xuất không burst, nên người vận hành mua được cả headroom burst lẫn thông lượng batch bằng cùng một lượng dung lượng. **Câu hỏi ngưỡng Pareto nên là bao nhiêu do đó trở thành một câu hỏi chung của Kuberina và Kalena**, và Mục 6.3 đưa nó vào phần đánh giá như một chỉ số thay vì coi nó là một chi tiết cấu hình của Kuberina.

### 5.3. Trả lời hạn chế mà Kuberina tự nêu

Bài báo Kuberina liệt kê các hạn chế của chính nó, và hai trong số đó mô tả chính xác đóng góp của Kalena.

> **Không có vòng phản hồi lúc chạy.** "Khác với Autopilot, Kuberina không quan sát mức tiêu thụ tài nguyên thực tế. Các quyết định đặt chỗ của nó chỉ dựa trên request/limit đã khai báo, vốn có thể sai lệch so với hành vi sử dụng trong thực tế."

Đây là khoảng trống mà kho lưu trữ mức sử dụng lấp đầy (Mục 5.5). Kuberina đóng gói theo request đã khai báo vì request đã khai báo là đầu vào duy nhất nó có. Cung cấp phân phối thực nghiệm của mức sử dụng thật cho phép một chu kỳ hoạch định sau đóng gói theo những gì workload thực sự làm thay vì theo phỏng đoán của tác giả manifest.

> **Tĩnh so với động.** "Khi workload thay đổi lúc chạy [...] blueprint có thể trở nên cũ. Tổ chức phải xác định tần suất hoạch định lại phù hợp: theo từng lần triển khai (kích hoạt bởi CI/CD), theo chu kỳ (ví dụ hằng ngày), hoặc theo sự kiện (khi độ lệch tận dụng vượt một ngưỡng)."

Kalena cung cấp tín hiệu còn thiếu cho phương án thứ ba. Trigger theo sự kiện đòi hỏi một thước đo được duy trì liên tục về mức độ thực tế đã trôi xa khỏi blueprint, và sổ cái reservation chính là thước đo đó. Kalena định nghĩa **độ trôi blueprint** là mức phân kỳ tổng hợp giữa request đã cam kết và reservation ở trạng thái ổn định:

$$D(t) = \frac{1}{|\mathcal{P}|}\sum_{i \in \mathcal{P}} \frac{\left\lVert \text{req}_i - R_i(t) \right\rVert_1}{\left\lVert \text{req}_i \right\rVert_1}$$

Khi $D(t)$ vượt ngưỡng do người vận hành cấu hình, Kalena phát ra một khuyến nghị hoạch định lại kèm theo các phân phối thực nghiệm cần thiết để hành động. Kalena không tự kích hoạt hoạch định lại. Blueprint là một hiện vật đã qua bình duyệt trong triết lý thiết kế của Kuberina, và việc âm thầm tái sinh nó sẽ phá hủy đúng tính chất làm nên giá trị của nó.

### 5.4. Tính khả thi kiến trúc: Tách bạch đặt chỗ sản xuất khỏi thu hoạch slack

Lý do chính khiến các hệ thống tập trung như Google Borg hay các bộ lập lịch container tổng quát gặp độ phức tạp khổng lồ khi thử làm overcommitment trực tuyến là việc gộp chung hai trách nhiệm xung khắc:

1. Giải bài toán đặt chỗ NP-khó, đa ràng buộc (affinity, anti-affinity, gang scheduling, topology spread) cho các workload sản xuất trọng yếu trong vòng vài mili giây.
2. Ước lượng slack tài nguyên động và đồng lập lịch workload theo lô cơ hội theo thời gian thực.

Kuberina cô lập và giải quyết trọn vẹn bài toán thứ nhất ở pha ngoại tuyến. Vì Kuberina bỏ ra thời gian tính toán cần thiết ở đầu vào để sinh ra một blueprint bất biến tối ưu, các workload sản xuất đến cụm với vị trí node đã được định trước.

Tài liệu Borg cung cấp bằng chứng định lượng cho phép phân rã này. Mọi kỹ thuật mở rộng quy mô liệt kê ở Mục 4.2 tồn tại để làm cho việc đặt chỗ sản xuất trực tuyến trở nên khả thi, và mức độ cần thiết tập thể của chúng thật đáng chú ý: khi tắt chúng đi, một lượt lập lịch đầy đủ "không hoàn thành sau hơn 3 ngày." Kalena không cần bất kỳ kỹ thuật nào trong số đó cho việc đặt chỗ sản xuất, vì nó không thực hiện việc đó.

Sự phân chia kiến trúc này thay đổi căn bản các yêu cầu vận hành của Kalena:

* **Không gian bài toán cục bộ, đơn biến:** Kalena đánh giá slack còn lại theo từng node. Nó ghép tác vụ cơ hội nhẹ với dung lượng nhàn rỗi cục bộ mà không phải giải lại đồ thị affinity ở phạm vi toàn cụm.
* **Quyết định preemption tầm thường:** khi một workload sản xuất tăng vọt, Kalena thực thi một can thiệp nhị phân: throttle hoặc trục xuất tác vụ theo lô cục bộ. Hệ thống tránh được việc tái cân bằng phức tạp trên toàn cụm.
* **Phạm vi kỹ thuật thực tế:** việc tách rời bài toán đặt chỗ sản xuất cho phép Kalena vận hành như một plugin gọn và dễ bảo trì. Cài đặt tránh được cạm bẫy của một monolithic scheduler quá tải.

Chính lộ trình của Borg cũng chứng thực hướng đi này. Mục 3.4 của bài báo ghi nhận rằng Borg cuối cùng đã áp dụng điều khiển tương tranh lạc quan theo tinh thần của Omega và "gần đây đã bổ sung khả năng cho Borg dùng các scheduler khác nhau cho các loại workload khác nhau." Thiết kế secondary scheduler của Kalena là điểm cuối của con đường mà Borg vốn đã đang đi.

### 5.5. Kho lưu trữ mức sử dụng và hợp đồng giao diện

Borg ghi lại toàn bộ lần nộp job, sự kiện task, và thông tin sử dụng tài nguyên chi tiết theo từng task vào Infrastore, một kho dữ liệu chỉ đọc có thể truy vấn. Nó được dùng cho tính phí theo mức sử dụng, gỡ lỗi job và lỗi hệ thống, cùng hoạch định năng lực dài hạn, và nó là nguồn của các trace cụm Google công khai.

Kalena cần một thứ tương đương, và đó là cơ chế cụ thể đứng sau lời hứa phản hồi vòng kín ở Mục 5.1. Kho lưu trữ mức sử dụng của Kalena giữ lại chuỗi thời gian reservation và usage theo từng workload trên cả tám chiều, các sự kiện trục xuất cùng nguyên nhân kích hoạt, và thời lượng bị throttle.

**Kalena đọc gì từ Kuberina.** Solver hiện tại phát ra một bảng ánh xạ phẳng, `solution: {namespace/pod: node}`, cùng với các file đầu vào Kuberina IR v0.2.0 mô tả node, DaemonSet, pod và request của chúng. Việc render manifest kèm vị trí đã tiêm được lên lịch dưới dạng frontend `kuberina-forge` ở v0.3.0 và chưa tồn tại. Kalena do đó tiêu thụ trực tiếp IR và bảng ánh xạ, và đây dù sao cũng là giao diện ổn định hơn: đó chính là dữ liệu mà solver của Kuberina đã vận hành trên đó, nên hai hệ thống không thể bất đồng về dung lượng, request, hay phần khấu trừ DaemonSet.

**Kalena ghi lại gì.** Kho lưu trữ xuất ra các phân phối thực nghiệm theo từng workload, cùng hình dạng 8 chiều với `ResourceVector`, để một chu kỳ hoạch định sau có thể thay một phân vị quan sát được vào chỗ request đã khai báo mà không cần chuyển đổi schema. Bản ghi xuất ra cho mỗi workload gồm: request đã khai báo, phân phối reservation ở trạng thái ổn định, đỉnh quan sát được, tần suất burst, và tỷ lệ mẫu vượt quá request.

Kuberina nên đóng gói theo phân vị nào là một lựa chọn chính sách của người vận hành chứ không phải một sự kiện Kalena có thể tự quyết, và đó là nơi tự nhiên để biểu đạt khẩu vị rủi ro. Đóng gói theo P50 tối đa hóa mật độ và trông cậy vào Kalena hấp thụ sai số; đóng gói theo P99 tiệm cận hành vi dựa-trên-request-khai-báo mà Kuberina đang có. Đây chính là quyết định điểm gấp khúc giống như $\lambda$ ở Mục 6.4, chỉ là biểu đạt ở thời điểm hoạch định thay vì lúc chạy.

Kho lưu trữ này cũng là thứ khiến giao thức hiệu chỉnh ở Mục 6.4 trở nên khả thi, vì đường cong an toàn liên hệ $\lambda$ với tỷ lệ trục xuất và OOM chỉ có thể vẽ được từ dữ liệu lịch sử.

### 5.6. Ranh giới với scheduler extender của Kuberina

Phần công việc tương lai của Kuberina đề xuất "một scheduler extender tự động áp blueprint dưới dạng ưu tiên chấm điểm bên trong `kube-scheduler`, bắc cầu giữa hoạch định ngoại tuyến và thực thi lúc chạy." Thành phần đó và Kalena đều gắn vào đường lập lịch của Kubernetes, và ranh giới giữa chúng nên được phát biểu trước khi cái nào được xây.

Extender biểu đạt *ý định* của blueprint đối với pod sản xuất cho bộ lập lịch mặc định, để một pod được tạo lại sau sự cố node sẽ đáp xuống nơi blueprint muốn. Kalena lập lịch một quần thể pod hoàn toàn khác vào phần dung lượng mà blueprint chưa bao giờ cấp phát. Chúng vận hành trên hai tập workload rời nhau và hai sổ cái rời nhau, đúng sự phân tách mà Mục 2.3 thiết lập, và chúng kết hợp được với nhau: extender giữ cho tác vụ sản xuất trung thành với blueprint, còn bất biến khôi phục của Kalena bảo đảm nó luôn có thể đưa node về đúng trạng thái mà extender đang cố duy trì.

---

## 6. Cài đặt & Đánh giá

### 6.1. Ngăn xếp công nghệ

* **Ngôn ngữ lõi: Go (Golang)** cho bản prototype và các bản phát hành sản xuất đầu tiên, bảo đảm tương thích nguyên bản với `k8s.io/kubernetes` (Scheduling Framework), `client-go`, và `moby/moby` (Docker SDK).
* **Đồng bộ với chuỗi công cụ Kuberina.** Solver của Kuberina viết bằng Rust còn frontend `kuberina-forge` dự kiến viết bằng Go, nên bản triển khai Go của Kalena dùng chung ngôn ngữ với thành phần mà nó trao đổi dữ liệu. Lộ trình v0.4.0 của Kuberina chuyển giao diện forge-tới-solver từ YAML tĩnh sang gRPC streaming trên Protobuf, và phần xuất dữ liệu của Kalena nên nhắm tới lớp truyền tải đó khi nó ra đời thay vì cam kết vào một hợp đồng chỉ có YAML.
* **Lõi Rust, nếu cần.** Thiết kế cho phép tích hợp một lõi tối ưu hóa viết bằng Rust qua Go FFI nếu các phép tính thời gian thực đòi hỏi thông lượng số học chuyên biệt. Ngưỡng cho việc này khá cao: bài toán chấm điểm theo từng node của Kalena nhỏ hơn nhiều so với GA toàn cụm của Kuberina, vốn đã xử lý 2.714 pod trên 186 node trong dưới 44 giây.
* **Giấy phép.** Kalena phát hành theo AGPLv3, khớp với giấy phép Phase 1 của Kuberina và chịu cùng lộ trình chuyển đổi ba pha, để hai thành phần của hệ sinh thái có thể phân phối và tái cấp phép cùng nhau.

### 6.2. Phương pháp đánh giá: Nén cụm (Cluster Compaction)

Mức tận dụng trung bình là một metric chính không thỏa đáng, và Borg nói thẳng điều đó: "Các job của chúng tôi có ràng buộc đặt chỗ và phải xử lý được các đợt tăng tải hiếm gặp, máy của chúng tôi không đồng nhất, và chúng tôi chạy batch job trong tài nguyên thu hồi từ service job. Vậy nên, để đánh giá các lựa chọn chính sách, chúng tôi cần một metric tinh vi hơn 'mức tận dụng trung bình'."

Thứ họ thay thế là **cell compaction**, và Kalena áp dụng nó dưới tên **cluster compaction**:

> Cho trước một workload, xác định cụm nhỏ nhất có thể chứa vừa nó, bằng cách gỡ dần node đi cho tới khi workload không còn vừa nữa, và đóng gói lại workload từ đầu ở mỗi bước để không bị kẹt vào một cấu hình xui rủi.

Kỷ luật thực nghiệm bao quanh nó quan trọng không kém định nghĩa:

* **Lặp lại mỗi thí nghiệm 11 lần trên mỗi cụm** với seed ngẫu nhiên khác nhau, để giữ tính không đồng nhất thông qua việc gỡ node ngẫu nhiên.
* **Báo cáo phân vị 90, không phải trung bình hay trung vị.** Lý do của Borg mang tính vận hành hơn là thống kê: "trung bình hay trung vị sẽ không phản ánh điều mà một quản trị viên hệ thống sẽ làm nếu họ muốn khá chắc chắn rằng workload sẽ vừa." Thanh sai số hiển thị toàn bộ khoảng min-max qua các lần thử.
* **Chuyển ràng buộc cứng thành ràng buộc mềm** cho các nhóm workload lớn hơn nửa kích thước cụm gốc, và cho phép một tỷ lệ nhỏ (Borg dùng 0.2%) các workload đặc biệt kén chọn được nằm pending.

Kết quả tiêu đề khi đó được biểu diễn theo đúng cách Borg biểu diễn giá trị của reclamation trong Figure 10 của họ: **số node phải bổ sung nếu tắt reclamation đi.** Cách này cho ra một con số chi phí-lợi ích trực tiếp, có thể so sánh với kết quả đã công bố của Borg, và vững chắc hơn hẳn một tỷ lệ tận dụng thô.

**Đường cơ sở của phép nén là Kuberina, không phải `kube-scheduler`.** Borg nén so với chính bộ lập lịch của mình vì họ không có bộ hoạch định thượng nguồn. Kalena thì có, và việc so sánh Kalena-cộng-Kuberina với một cụm first-fit ngây thơ sẽ ghi công cho Kalena phần giảm số node mà Kuberina vốn đã đạt được. Mọi thí nghiệm nén do đó chạy cả hai nhánh qua Kuberina trước, và biến duy nhất là bật hay tắt reclamation. Các con số Irina đã công bố của Kuberina (152 hoặc 182 node hoạt động tùy chế độ Pareto) là đường cơ sở mà kết quả của Kalena phải được báo cáo đối chiếu.

### 6.3. Chỉ số đánh giá

| # | Chỉ số | Mục tiêu | Phương pháp |
| --- | --- | --- | --- |
| 1 | Số node tiết kiệm được nhờ reclamation | Kết quả chính | Cluster compaction, bật so với tắt reclamation |
| 2 | Tỷ lệ workload chạy trên dung lượng thu hồi | Tương đương mức ~20% của Borg ở cell trung vị | Kế toán sổ cái reservation trên trace replay |
| 3 | Bảo toàn SLO của tác vụ sản xuất | Có chặn, được hiệu chỉnh (xem bên dưới) | Trễ P99 và thông lượng của workload tier service, khi co-located so với khi cách ly |
| 4 | Độ trễ lập lịch CPU dưới tải | Đại đa số thread chờ dưới 5 ms ở mức tận dụng node 80-100% | PSI theo cgroup và `schedstat`, phân nhóm theo mức tận dụng CPU của node |
| 5 | Độ trễ phản ứng giảm thiểu | Dưới một giây | Thời gian từ thông báo PSI tới khi CFS throttle được áp hoặc lệnh trục xuất được phát |
| 6 | Độ chính xác của reservation | Diện tích ước lượng thừa nhỏ | CDF của tỷ lệ reservation/request và usage/request |
| 7 | Tiến triển của tác vụ theo lô | Bỏ đói có chặn | Phân phối độ giãn thời gian hoàn thành và tổng thời gian bị throttle |
| 8 | Hiệu suất khoản dự trữ Pareto | Khoản dự trữ có mang việc hữu ích | Tỷ lệ khoản dự trữ Pareto trên từng node của Kuberina bị batch chiếm dụng, đo qua một chu kỳ ngày đêm |
| 9 | Độ trung thành với blueprint | Zero vi phạm ở mọi thời điểm | Kiểm chứng liên tục rằng trục xuất toàn bộ batch khôi phục trạng thái blueprint, cộng zero vi phạm anti-affinity hay topology spread của tác vụ sản xuất do Kalena gây ra |
| 10 | Ngưỡng Pareto tối ưu | Kết quả chung | Quét `--pareto` từ 70 đến 100 với reclamation bật, và định vị thiết lập tối đa hóa tổng công việc hữu ích |

Các chỉ số 8 đến 10 không có tương ứng ở Borg và chỉ tồn tại vì Kuberina nằm ở thượng nguồn. Chỉ số 9 là một cổng kiểm tra tính đúng đắn chứ không phải một con số hiệu năng: bất kỳ giá trị khác không nào cũng làm mất hiệu lực lần chạy đó. Chỉ số 10 là câu hỏi chung nêu ở Mục 5.2, và là thí nghiệm nhiều khả năng nhất sẽ thay đổi cách Kuberina được vận hành, vì nó biến ngưỡng Pareto từ một trực giác thành một điểm tối ưu đo được.

Việc kiểm chứng cho chỉ số 9 dùng lại chính bộ kiểm định ngoài của Kuberina (`research/inspector.py`), vốn đọc lại các file hạ tầng, workload và lời giải rồi kiểm tra mọi ràng buộc từ đầu. Chạy nó trên trạng thái cụm trực tiếp sau khi lọc bỏ workload theo lô là một phép thử trực tiếp cho bất biến khôi phục, và nó có tính chất là bộ kiểm tra do hệ thống thượng nguồn viết chứ không phải do Kalena viết.

**Ghi chú về chỉ số 3.** Các bản nháp trước của đề xuất này đặt mục tiêu suy giảm trễ P99 dưới 2%. Các phép đo của Borg gợi ý con số này có thể lạc quan nếu được hiểu như một chặn nhiễu tổng quát. Borg lấy mẫu chỉ số cycles-per-instruction trên khoảng 12.000 task sản xuất trong một tuần và tìm được CPI trung bình 1.58 ở shared cell so với 1.53 ở dedicated cell, tức **hiệu năng CPU tệ hơn khoảng 3% khi co-location.** Một đối chứng sạch hơn là chính Borglet, vốn chạy trên mọi máy ở cả hai loại cell, cho thấy khoảng cách lớn hơn: CPI 1.20 ở dedicated cell so với 1.43 ở shared cell.

Hai điều kiện hạn định giữ cho con số này không đến mức nản lòng. Thứ nhất, suy giảm CPI và suy giảm trễ request là hai đại lượng khác nhau, và một dịch vụ không bị chặn bởi CPU sẽ thể hiện ảnh hưởng lên trễ nhỏ hơn nhiều so với mức dịch chuyển CPI của nó. Thứ hai, và quan trọng hơn, Borg quan sát rằng các tương quan này tuy có ý nghĩa thống kê nhưng "chỉ giải thích được 5% phương sai mà chúng tôi thấy trong các phép đo CPI," với đặc trưng riêng của từng ứng dụng mới là yếu tố chi phối.

Kalena do đó phát biểu mục tiêu dưới dạng một biên độ được hiệu chỉnh thay vì một hằng số cố định: nhiễu được đo theo từng lớp workload trong giao thức hiệu chỉnh, và giá trị $\lambda$ được chọn sao cho mức suy giảm quan sát được nằm trong ngưỡng chịu đựng mà người vận hành khai báo. Con số 3% được mang theo trong tài liệu này với tư cách một tiên nghiệm trung thực.

Chỉ số 4 là đối trọng đáng khích lệ. Figure 13 của Borg cho thấy ngay cả ở mức tận dụng CPU máy 80-100%, tỷ lệ thời gian mà một thread sẵn sàng chạy phải chờ hơn 5 ms để lấy được CPU vẫn nằm trong vài phần trăm, và các lần chờ vượt 10 ms gần như không tồn tại. Mức tận dụng cao và độ trễ lập lịch thấp là hai điều tương thích với nhau, và đó là tiền đề mà toàn bộ đề xuất này dựa lên.

### 6.4. Giao thức hiệu chỉnh tham số

$\alpha$, $\lambda$, $T_{\text{grace}}$, và $T_{\text{min}}$ không có giá trị công bố. Các mặc định của Kalena phải được rút ra từ thực nghiệm, và Borg ghi lại một giao thức cho đúng việc này.

Borg cho một cell sản xuất đang chạy thật đi qua bốn tuần liên tiếp: baseline, **aggressive** (giảm biên an toàn), **medium** (nằm giữa baseline và aggressive), rồi baseline trở lại. Hai đại lượng được theo dõi cùng lúc: khoảng cách giữa reservation và usage, và số sự kiện out-of-memory tích lũy. Reservation bám theo usage sát hơn thấy rõ ở thiết lập aggressive, và tỷ lệ OOM chỉ tăng nhẹ. Borg kết luận rằng "lợi ích ròng lớn hơn mặt trái" và triển khai thiết lập medium trên toàn hệ thống.

Kalena tái hiện cấu trúc này:

1. Chạy cùng một workload qua một dải thiết lập $\lambda$, mỗi thiết lập tối thiểu một chu kỳ ngày đêm đầy đủ, theo bố trí A/B/A/B để tách được ảnh hưởng của tham số khỏi sự trôi dạt của workload.
2. Ghi nhận đồng thời: dung lượng thu hồi được, số lần trục xuất, số lần OOM ở mức kernel, và trễ P99 của workload tier service.
3. Vẽ **đường cong an toàn** giữa dung lượng thu hồi và tỷ lệ vi phạm SLO, và lấy điểm gấp khúc của đường cong đó làm mặc định phát hành.
4. Phơi bày $\lambda$ như một giá trị chỉnh được lúc chạy, để người vận hành tự dịch chuyển dọc đường cong theo khẩu vị rủi ro của mình.

Luận điểm phương pháp luận có tính tổng quát: **các giá trị mặc định của Kalena là kết quả thực nghiệm, không phải hằng số thiết kế,** và tài liệu nên trình bày chúng đúng như vậy.

### 6.5. Thiết lập thực nghiệm

Việc đánh giá đi theo phương pháp bốn hướng.

**Testbed MSC Irina, kế thừa từ Kuberina.** Kalena dùng lại benchmark tổng hợp của Kuberina thay vì tự dựng riêng, vì một testbed dùng chung là cách duy nhất để kết quả của hai hệ thống ghép lại thành một tuyên bố duy nhất về hệ sinh thái. Bộ sinh dữ liệu là `research/gen_irina_testdata.py`, và cụm gồm 186 node thuộc các loại standard (64 core, 256 GiB), memory-optimized (32 core, 512 GiB) và GPU (48 core, 192 GiB, 8 GPU), mang 2.714 pod với 4.632 ràng buộc anti-affinity và 496 ràng buộc affinity, cùng 4 DaemonSet được khấu trừ trước ở Phase 0.

Cần hai phần mở rộng để biến nó thành một benchmark cho việc thu hồi. Thứ nhất, các workload chỉ mang request đã khai báo mà không có hành vi sử dụng, nên mỗi pod được gán một hồ sơ sử dụng theo chu kỳ ngày đêm tổng hợp, tham số hóa bởi tỷ lệ request-trên-đỉnh và tần suất burst, hiệu chỉnh theo các phân phối request-so-với-usage quan sát được trong trace Google và Alibaba. Thứ hai, cần bổ sung một quần thể workload theo lô, vì 2.714 pod hiện có đều là tác vụ sản xuất. Hai phần mở rộng này được đóng góp ngược lại cho repository Kuberina, vì chúng hữu ích ở đó không kém.

**Phát lại trace.** Sử dụng các trace công nghiệp công khai:

* *Google Cluster Workload Traces* (`clusterdata-2011-2` và `clusterdata-2019`), đại diện cho các sự kiện lập lịch không đồng nhất từ các cell Borg. Đây chính là các trace do hệ thống Infrastore mô tả ở Mục 5.5 sinh ra, điều này khiến chúng có thể so sánh trực tiếp với các cơ chế mà Kalena tái hiện.
* *Alibaba Cluster Trace* (`clusterdata`), chứa trace của microservice co-located và tính toán theo lô.

Phần threats-to-validity của chính Kuberina xác định đây là một khoảng trống còn tồn đọng ở phía họ: "việc kiểm chứng trên các trace cụm thực tế (ví dụ Google Cluster Trace, Alibaba Cluster Trace) sẽ củng cố tính hiệu lực ngoại tại." Bộ khung nạp trace mà Kalena cần tạo ra đúng hiện vật mà Kuberina cần, ở dạng Kuberina IR v0.2.0, nên xây một lần là phục vụ được cả hai bài báo.

Một khoảng trống chung thứ hai cũng đáng nêu tên. Kuberina báo cáo rằng benchmark của họ nạp zero pod group, khiến toàn bộ bộ máy gang scheduling được đặc tả hình thức mà chưa được đánh giá thực nghiệm. Workload gang lại chính là quần thể batch điển hình, nên phần mở rộng batch mô tả ở trên sẽ cung cấp các job có cấu trúc gang và qua đó vận dụng luôn đường Block Booking của Kuberina.

**Mô phỏng cụm quy mô lớn.**

* **`kwok` (Kubernetes WithOut Kubelet):** mô phỏng hàng nghìn node và hàng chục nghìn pod trên một máy trạm lập trình viên với dấu chân bộ nhớ tối thiểu. Đây là phương tiện cho các thí nghiệm cluster compaction ở Mục 6.2, vì compaction đòi hỏi đóng gói lại cùng một workload rất nhiều lần.
* **`kube-burner`:** sinh biến động vòng đời pod và các đợt tăng tải tổng hợp để kiểm thử khả năng chống chịu của bộ lập lịch.

**Phát lại độ trung thực cao.** Borg xây dựng Fauxmaster, một simulator chứa bản sao hoàn chỉnh mã nguồn Borgmaster sản xuất với các interface xuống Borglet được stub, được điều khiển bằng checkpoint của trạng thái cell thật. Nó được dùng để gỡ lỗi, hoạch định năng lực, và kiểm tra tiền bay trả lời những câu hỏi như "thay đổi này có trục xuất job quan trọng nào không?"

Bản tương đương của Kalena chạy **chính binary plugin lập lịch thật** trên một cụm nền `kwok` được cấp dữ liệu bằng chuỗi thời gian cAdvisor phát lại, chỉ stub các lời gọi enforcement của node agent. Giá trị nằm ở chỗ các thay đổi chính sách được đánh giá trên chính đoạn mã sẽ chạy trong sản xuất, thay vì trên một mô hình của nó. Cùng bộ khung này đóng vai công cụ tiền bay cho người vận hành: cho trạng thái đã ghi nhận của cụm hiện tại, báo cáo xem một thay đổi tham số được đề xuất sẽ trục xuất những workload theo lô nào.

Một ghi chú về chi phí, điều Borg nêu ra và càng đúng hơn với ngân sách nhỏ: thí nghiệm của họ có lúc tiêu thụ 200.000 CPU core, "ngay cả ở quy mô của Google, đây là một khoản đầu tư không tầm thường." Compaction tốn kém vì nó đóng gói lại nhiều lần. `kwok` là lựa chọn khiến việc này khả thi trên một máy trạm.

### 6.6. Hạn chế và Thách thức kỹ thuật đã biết

* **Độ trễ lấy mẫu của cAdvisor.** cAdvisor polling metric theo chu kỳ mặc định 10-15 giây, trong khi các cú tăng vọt tiêu thụ bộ nhớ có thể xảy ra trong khoảng dưới một giây. Điều này chặn độ chính xác của bộ ước lượng. Nó không chặn tính an toàn của hệ thống, vì enforcement chạy trên kênh nhanh PSI (Mục 3.1). Rủi ro còn lại là ước lượng thừa slack khả dụng giữa hai lần lấy mẫu, biểu hiện thành một lần trục xuất thay vì một sự cố ngừng dịch vụ.
* **Rủi ro OOM ở mức nhân Linux.** Trục xuất chậm trễ có thể kích hoạt kernel OOM killer trước khi Kalena chấm dứt được tác vụ theo lô, gây rủi ro chấm dứt nhầm tiến trình sản xuất. Biện pháp giảm thiểu: ngưỡng `memory.high` của cgroups v2 thực thi throttle ở mức nhân đối với cấp phát bộ nhớ của batch trước khi `memory.max` bị vượt, và tích hợp PSI `eventfd` cung cấp thông báo tranh chấp bộ nhớ không cần polling.
* **Kế toán bộ nhớ dưới cơ chế cache tệp háo hức.** Borg ghi nhận rằng "cơ chế file-caching háo hức của Linux làm phức tạp đáng kể phần cài đặt vì nhu cầu kế toán bộ nhớ chính xác." Việc quy gán page cache thực sự mơ hồ, và phần cache có thể thu hồi của một workload không nên bị tính vào sổ của nó y hệt như bộ nhớ ẩn danh. Bộ ước lượng của Kalena vận hành trên xấp xỉ working-set suy ra từ `memory.current` của cgroups v2 trừ đi phần page cache có thể thu hồi, và độ chính xác của phép phân tách này là một vấn đề còn để ngỏ.
* **Nhiễu ở mức thấp nằm ngoài tầm kiểm soát của cgroup.** Borg lưu ý rằng ngay cả với containment cgroup đầy đủ, "nhiễu tài nguyên ở mức thấp (ví dụ băng thông bộ nhớ hoặc ô nhiễm L3 cache) vẫn thỉnh thoảng xảy ra." Kalena kế thừa hạn chế này mà không có lời giải. Đó là sàn không thể rút gọn nằm dưới chỉ số 3 và là lời giải thích khả dĩ nhất cho phần suy giảm trễ còn dư mà mô hình reservation không dự đoán được.
* **Thông báo preemption chỉ là best-effort.** Như mô tả ở Mục 3.5, grace period không được bảo đảm dưới áp lực cấp tính.
* **Khoảng trống thực thi trên các chiều đĩa và mạng.** Như nêu ở Mục 3.2, `io.max` của cgroups v2 hành xử không nhất quán giữa các tầng lưu trữ và hoàn toàn không có controller cgroup cho băng thông mạng. Bốn trong tám chiều của Kuberina do đó có hạch toán mà chưa được thực thi, nghĩa là Kalena phát hiện được tranh chấp I/O và mạng và xếp hạng đặt chỗ để né tránh, mà chưa thể ép một workload theo lô nhường băng thông.
* **Blueprint cũ đi làm giới hạn các bảo đảm của Kalena.** Bất biến khôi phục bảo đảm Kalena đưa được node về trạng thái blueprint. Nó không bảo đảm trạng thái đó còn phù hợp. Nếu workload sản xuất đã bị lập lịch lại do hỏng node, được co giãn bởi HPA, hoặc bị một vertical autoscaler thay đổi, cụm đang chạy không còn khớp blueprint và sổ cái request của Kalena trôi khỏi thực tế. Kalena phát hiện điều này qua chỉ số độ trôi ở Mục 5.3 và báo cáo nó. Giải quyết nó đòi hỏi hoạch định lại Kuberina, vốn là một hành động có người gác cổng.
* **Dung lượng GPU không được thu hồi.** Mục 2.4 loại trừ hoàn toàn chiều GPU. Trên benchmark Irina của Kuberina, điều này để lại 88 trong 240 đơn vị GPU không được cấp phát và không khả dụng cho tác vụ cơ hội, và đó là hạng mục dung lượng lớn nhất mà Kalena chủ động từ chối thu hoạch.

---

## 7. Khả năng quan sát và Trải nghiệm Vận hành

Borg coi introspection là một yêu cầu hạng nhất thay vì một tính năng, và lập luận của họ chuyển giao trực tiếp:

> "Một quyết định thiết kế quan trọng trong Borg là phơi bày thông tin gỡ lỗi cho mọi người dùng thay vì giấu nó đi: Borg có hàng nghìn người dùng, nên 'tự phục vụ' phải là bước đầu tiên trong gỡ lỗi."

Một reclamation scheduler đưa ra những quyết định vô hình theo bản chất cấu tạo. Một batch pod nằm pending, và lý do là slack của node đã tụt xuống dưới request của nó bốn giây trước. Một batch pod bị giết, và lý do là một pod sản xuất trên cùng node đã vượt qua reservation của nó. Không có lời giải thích, điều này bị đọc thành hành vi sai lệch phi tất định của bộ lập lịch, và đó là thứ giết chết lòng tin của người vận hành ở đúng nhóm hệ thống mà Kalena nhắm tới.

Kalena do đó cam kết ba bề mặt:

1. **Lời giải thích "vì sao pending?",** theo thông lệ của Borg là cung cấp một chú thích pending "kèm hướng dẫn về cách sửa resource request của job để vừa với cell hơn." Kalena phát ra Kubernetes event nêu tên ràng buộc đang chặn (chiều tài nguyên nào, trên bao nhiêu node, thiếu bao nhiêu) và mức điều chỉnh request sẽ khiến workload lập lịch được.
2. **Bản ghi "vì sao bị trục xuất?",** nêu tên điều kiện node đã kích hoạt, workload nào có reservation tăng lên, phép so sánh priority nào đã chọn nạn nhân này, và ngoại lệ vượt limit có được áp dụng hay không.
3. **Khung nhìn slack theo từng node,** phơi bày dung lượng, tổng limit, tổng reservation, và usage trực tiếp dưới dạng bốn chuỗi riêng biệt. Figure 12 của Borg vẽ đúng bốn đại lượng này, và khoảng cách trực quan giữa limit và reservation là cách biểu diễn trực tiếp nhất về việc hệ thống đang làm gì mà bất kỳ người vận hành nào cũng sẽ gặp.

Bản tổng kết của chính Borg nêu ra đối trọng, và Kalena nên lưu tâm. Trong mục "lessons learned: the bad," bài báo chỉ ra lỗi **tối ưu cho power user với cái giá là người dùng phổ thông**, ghi nhận rằng đặc tả BCL phình lên khoảng 230 tham số và "sự phong phú của API này khiến mọi thứ khó khăn hơn cho người dùng 'phổ thông', và bó hẹp khả năng tiến hóa của nó." Toàn bộ tiền đề OpX của Kalena là cơ chế opt-in bằng một label duy nhất ở Mục 2.8. Mọi núm vặn được giới thiệu trong tài liệu này đều là tùy chọn và có mặc định, và tính chất đó là một ràng buộc cho phát triển tương lai chứ không phải một sự tình cờ của bản nháp hiện tại.

---

## 8. Kết luận & Bước tiếp theo

Kalena hoàn thiện chu trình quản lý tài nguyên trong hệ sinh thái Naughtian. Việc ghép sự chặt chẽ tổ hợp ngoại tuyến của Kuberina với cơ chế thu hoạch slack trực tuyến dựa trên reclamation giúp tối đa hóa hiệu quả phần cứng trong khi vẫn tôn trọng các nguyên tắc Trải nghiệm Vận hành.

Mục tiêu thiết kế là một sự tái hiện trung thực hành vi reclamation và đồng lập lịch của Borg ở quy mô tự quản: bất biến feasibility hai sổ cái, bộ ước lượng reservation bất đối xứng cùng khoảng ân hạn khởi động của nó, vòng điều khiển ba tầng tách ước lượng khỏi thực thi, trục xuất theo thứ tự priority với điều kiện dừng đặt trên sổ cái reservation, và phương pháp đánh giá dựa trên compaction giúp kết quả so sánh được với các số liệu Borg đã công bố.

Ở những chỗ Kalena rời khỏi Borg, nó làm vậy vì Kuberina chiếm đúng vị trí mà bộ lập lịch của chính Borg từng nắm. Borg ước lượng reservation theo limit vì nó cũng quyết định đặt chỗ; Kalena ước lượng theo request vì Kuberina đã quyết định đặt chỗ trước, và bất biến khôi phục blueprint là thứ giữ cho quyết định đó bất khả xâm phạm. Borg thu hồi hai lớp tài nguyên; Kalena thu hồi trên tám chiều của Kuberina và từ chối trường hợp thứ chín, GPU, một cách công khai. Borg không có bộ hoạch định thượng nguồn nào để nuôi dữ liệu; kho lưu trữ mức sử dụng của Kalena trả lời đúng khoảng trống phản hồi lúc chạy mà Kuberina tự nêu là hạn chế của mình.

Lộ trình phát triển trước mắt:

1. Phát triển prototype Go đầu tiên dưới dạng plugin Kubernetes Scheduling Framework, cài đặt bất biến hai sổ cái (Mục 2.3) trước tiên, vì mọi cơ chế khác đều phụ thuộc vào nó. Kiểm chứng liên tục đối chiếu với tính chất khôi phục blueprint bằng `inspector.py` của Kuberina.
2. Xây đường nạp Kuberina IR v0.2.0, để dung lượng node, phần khấu trừ DaemonSet, request và ràng buộc topology được đọc từ chính các hiện vật mà solver đã dùng thay vì suy diễn lại từ cụm đang chạy.
3. Cài đặt vòng điều khiển ba tầng của node agent (Mục 3.1) và kiểm chứng trigger PSI `eventfd` của cgroups v2 cho phản ứng preemption dưới một giây. Thực thi CPU và bộ nhớ trước; đĩa và mạng tạm thời chỉ hạch toán và mang tính tham khảo.
4. Mở rộng testbed MSC Irina với hồ sơ sử dụng tổng hợp và một quần thể workload theo lô (Mục 6.5), đóng góp cả hai ngược lại cho repository Kuberina, và cài đặt cluster compaction (Mục 6.2) làm bộ khung đánh giá chính.
5. Thực thi giao thức hiệu chỉnh (Mục 6.4) để xác lập giá trị mặc định phát hành cho $\alpha$, $\lambda$, và $T_{\text{grace}}$, rồi chạy phép quét ngưỡng Pareto chung (Mục 6.3, chỉ số 10) và báo cáo kết quả cho phía Kuberina như một khuyến nghị vận hành.

---

## Phụ lục A: Bản đồ nguồn gốc từ Borg

Mỗi cơ chế được áp dụng trong đề xuất này, ánh xạ tới nguồn của nó trong Verma et al., *Large-scale cluster management at Google with Borg*, EuroSys 2015.

| Cơ chế của Kalena | Mục ở đây | Nguồn Borg | Điều chỉnh |
| --- | --- | --- | --- |
| Feasibility hai sổ cái (request cho service, reservation cho batch) | 2.3 | §5.5 | "Limit" của Borg trở thành **request** của Kubernetes, vì đó là thứ Kuberina đóng gói theo; sổ cái request do Kuberina đóng băng ngoại tuyến |
| Reservation khởi tạo bằng request của Kuberina | 2.5 | §5.5 | Borg khởi tạo bằng limit; Kalena khởi tạo bằng request và chặn trên reservation tại limit |
| Ân hạn khởi động 300 giây trước khi ước lượng | 2.5 | §5.5 | Lấy nguyên, cho cấu hình theo workload |
| Suy giảm chậm về usage, tăng tức thì | 2.5 | §5.5 | Viết lại thành EWMA bất đối xứng để tách $\alpha$ khỏi $\lambda$ |
| Cho phép tắt ước lượng theo workload | 2.5 | §2.5 | Dùng annotation thay cho capability của user |
| Tier và priority là hai trục trực giao | 2.6 | §2.5, §6.2 | Appclass thành `tier`; priority band thành số nguyên |
| Không preempt lẫn nhau trong tier service | 2.6 | §2.5 | Lấy để bảo vệ blueprint của Kuberina |
| Slack CPU bật mặc định, slack memory tắt mặc định | 2.7 | §6.2 | Lấy nguyên |
| Ước lượng tập trung và chậm, thực thi cục bộ và nhanh | 3.1 | §5.5, §6.2 | Tầng leo thang được nêu tường minh |
| Nén được thì throttle, không nén được thì trục xuất | 3.2 | §6.2 | Mở rộng từ 2 lớp của Borg lên 8 chiều của Kuberina, thêm lớp thứ ba không-thu-hồi-được cho GPU |
| Shares không đủ, cần CFS bandwidth control | 3.2 | §6.2 | Lấy nguyên |
| Trục xuất từ priority thấp nhất cho tới khi reservation được đáp ứng | 3.3 | §6.2 | Lấy nguyên, gồm cả điều kiện dừng |
| Ngoại lệ vượt limit trong thứ tự trục xuất | 3.3 | §5.5 | Lấy nguyên |
| Trần chống bỏ đói áp lên workload service tham lam | 3.4 | §6.2 | Giới hạn ở workload vượt reservation của chính nó |
| SIGTERM trước SIGKILL, best-effort | 3.5 | §2.3 | Lấy nguyên, giữ lại lưu ý tỷ lệ gửi 80% |
| Chấm điểm lai tối thiểu hóa tài nguyên bị kẹt | 4.1 | §3.2 | Lấy nguyên |
| Ưu tiên trộn nhiều mức priority trên một node | 4.1 | §3.2 | Lấy nguyên |
| Cache điểm bỏ qua thay đổi lượng nhỏ | 4.2 | §3.4 | Hình thức hóa thành lượng tử hóa slack, vì reservation dịch chuyển liên tục |
| Lớp tương đương | 4.2 | §3.4 | Ánh xạ sang chủ sở hữu pod template |
| Ngẫu nhiên hóa nới lỏng | 4.2 | §3.4 | Lấy nguyên |
| Tương tranh lạc quan trên bản sao cache | 4.2 | §3.4 | Vốn có sẵn ở secondary scheduler |
| Tính cục bộ của package khi chấm điểm | 4.3 | §3.2 | Trở thành image locality, tăng trọng số |
| Xếp hàng lại thay vì migrate hay hibernate | 4.4 | §3.2 chú thích 3 | Lấy nguyên |
| Giới hạn tốc độ lập lịch lại từ node mất liên lạc | 4.4 | §4 | Lấy nguyên |
| Tránh lặp lại cặp workload-node gây hại | 4.3 | §4 | Tổng quát hóa thành thời gian nguội sau trục xuất |
| Quota ở khâu thu nhận | 4.5 | §2.5 | Đơn giản hóa thành trần tùy chọn theo namespace |
| Kho lưu trữ mức sử dụng phục vụ hoạch định năng lực | 5.5 | §2.6 (Infrastore) | Bên tiêu thụ phản hồi là Kuberina |
| Cluster compaction làm metric đánh giá | 6.2 | §5.1 | Lấy nguyên, gồm 11 lần thử và phân vị 90 |
| Định giá reclamation bằng "số node phải thêm nếu không có nó" | 6.2 | §5.5, Fig. 10 | Lấy nguyên |
| Hiệu chỉnh tham số A/B/A trên cụm đang chạy | 6.4 | §5.5, Fig. 12 | Lấy nguyên |
| Phát lại độ trung thực cao trên chính mã scheduler thật | 6.5 | §3.1 (Fauxmaster) | `kwok` cộng phát lại trace cAdvisor |
| Chẩn đoán tự phục vụ "vì sao pending?" | 7 | §2.6, §8.2 | Lấy nguyên |
| Tránh phình tham số cho power user | 7 | §8.1 | Coi như một ràng buộc thiết kế |

Các cơ chế dưới đây không có tiền lệ ở Borg và tồn tại vì Kuberina nằm ở thượng nguồn.

| Cơ chế của Kalena | Mục ở đây | Nguồn gốc từ Kuberina |
| --- | --- | --- |
| Bất biến khôi phục blueprint | 2.3 | Blueprint là một chứng minh khả thi mà Kalena không được làm mất hiệu lực |
| Dung lượng node là đại lượng ròng sau Phase 0 | 2.3 | PAPER.md §3.2 khấu trừ trước DaemonSet |
| DaemonSet nằm ngoài tập trục xuất | 3.3 | DaemonSet là biến không-quyết-định (nước dằn) |
| Bảng phân loại khả thu hồi 8 chiều | 2.4 | CHANGELOG v0.2.0 mở rộng MDBP 8D |
| GPU loại khỏi việc thu hồi | 2.4 | GPU là ràng buộc CSP cứng không có nguyên thủy điều tiết |
| Anti-affinity của tác vụ sản xuất ràng buộc việc đặt batch | 4.1 | Mục tiêu anti-affinity mã hóa trong Kuberina IR |
| Batch không bao giờ tính vào skew topology của tác vụ sản xuất | 4.1 | Hình phạt mềm `maxSkew` / `topologyKey` trong hàm fitness |
| Chỉ số độ trôi blueprint $D(t)$ | 5.3 | Trả lời PAPER.md §8.1 "ngưỡng hoạch định lại theo sự kiện" |
| Xuất phân phối thực nghiệm cho việc hoạch định lại | 5.5 | Trả lời PAPER.md §8.1 "Không có vòng phản hồi lúc chạy" |
| Khoản dự trữ Pareto là mảnh đất thu hoạch chính | 5.2 | Cờ `--pareto`, PAPER.md §6.2 Resource Canal |
| Quét ngưỡng Pareto như một chỉ số chung | 6.3 | Biến một lựa chọn cấu hình của Kuberina thành điểm tối ưu đo được |
| Đường cơ sở của phép nén là Kuberina, không phải `kube-scheduler` | 6.2 | Tránh ghi công cho Kalena phần giảm node của Kuberina |
| Kiểm chứng qua `inspector.py` của Kuberina | 6.3 | Dùng lại bộ kiểm định ngoài ở thượng nguồn |

## Phụ lục B: Số liệu tham chiếu từ Borg

Các giá trị nền được mang theo vào mục tiêu và lập luận của đề xuất này.

| Đại lượng | Giá trị | Nguồn |
| --- | --- | --- |
| CPU của tác vụ sản xuất: cấp phát so với sử dụng | cấp ~70%, chiếm ~60% mức sử dụng | §2.1 |
| Bộ nhớ cấp cho tác vụ sản xuất | ~55%, chiếm ~85% mức sử dụng bộ nhớ | §2.1 |
| Tỷ lệ workload chạy trên tài nguyên thu hồi, cell trung vị | ~20% | §5.5 |
| Số máy phải thêm nếu tách riêng sản xuất và batch | 20-30% ở mức trung vị | §5.2, Fig. 5 |
| Số tài nguyên phải thêm nếu làm tròn request lên lũy thừa của 2 | 30-50% ở mức trung vị | §5.4, Fig. 9 |
| Hiệu quả đóng gói của chấm điểm lai so với best-fit | 3-5% | §3.2 |
| CPI trung bình, shared cell so với dedicated cell | 1.58 so với 1.53 (tệ hơn ~3%) | §5.2 |
| CPI của Borglet, shared so với dedicated | 1.43 so với 1.20 | §5.2 |
| Phần phương sai CPI giải thích được bởi co-location | ~5% | §5.2 |
| Thread chờ > 5 ms ở mức tận dụng CPU node 80-100% | vài phần trăm | §6.2, Fig. 13 |
| Độ trễ khởi động task trung vị | ~25 s, ~80% là cài package | §3.2 |
| Tỷ lệ thông báo preemption được gửi tới | ~80% | §2.3 |
| Task phi sản xuất yêu cầu < 0.1 core | 20% | §3.2 |
| Batch task chủ động bật slack memory | 79% | §6.2 |
| Lượt lập lịch toàn workload khi tắt các kỹ thuật tối ưu | không xong sau 3 ngày | §3.4 |
| Tỷ lệ máy chạy từ 9 task trở lên | 50% | §6 |

## Phụ lục C: Hợp đồng giao diện với Kuberina

Bề mặt ghép nối chính xác giữa hai hệ thống, tính đến Kuberina v0.2.0 (2026-08-02).

### C.1. Dữ liệu Kalena đọc vào

| Hiện vật | Nguồn | Công dụng |
| --- | --- | --- |
| `nodes[].allocatable` (vector 8 chiều) | File hạ tầng Kuberina IR | Dung lượng node thô, trước Phase 0 |
| `daemonsets[]` kèm `nodeSelector` và `tolerations` | File hạ tầng Kuberina IR | Tính lại đúng phép khấu trừ Phase 0 để thu được $C_n$ |
| `nodes[].labels`, `.taints`, `.zone`, `.rack` | File hạ tầng Kuberina IR | Lọc khả thi và phân giải miền topology cho việc đặt batch |
| `pods[].requests` (vector 8 chiều) | File workload Kuberina IR | Sổ cái request, và giá trị khởi tạo của mọi reservation |
| `pods[].antiAffinity` | File workload Kuberina IR | Ràng buộc bắt buộc lên việc đặt batch (Mục 4.1) |
| `pods[].topologySpread` (`maxSkew`, `topologyKey`) | File workload Kuberina IR | Hạch toán skew mà batch không được làm xáo trộn |
| `solution: {namespace/pod: node}` | Đầu ra solver | Những workload sản xuất nào Kalena nên kỳ vọng trên mỗi node |

Kalena tính lại phép khấu trừ Phase 0 thay vì đọc một dung lượng đã dẫn xuất, vì giá trị dẫn xuất hiện chưa được phát ra. Bất kỳ sai lệch nào giữa phép tính lại của Kalena và của solver đều là lỗi ở một trong hai, và bộ kiểm định `inspector.py` dùng chung sẽ phát hiện ra.

### C.2. Dữ liệu Kalena ghi ra

Theo từng workload sản xuất, ở dạng `ResourceVector` để ghép thẳng vào IR mà không cần chuyển đổi:

| Trường | Ý nghĩa |
| --- | --- |
| `declared_request` | Điều manifest đã yêu cầu, giữ nguyên để đối chiếu |
| `reservation_p50`, `reservation_p95`, `reservation_p99` | Phân phối reservation ở trạng thái ổn định, loại trừ cửa sổ ân hạn khởi động |
| `observed_peak` | Mức sử dụng lấy mẫu lớn nhất trong cửa sổ lưu giữ |
| `burst_frequency` | Tỷ lệ mẫu vượt quá `declared_request` |
| `exceeded_limit_events` | Số lần vượt limit, đánh dấu một workload là định cỡ sai chứ không chỉ đơn thuần là cấp dư |

Theo từng node:

| Trường | Ý nghĩa |
| --- | --- |
| `slack_yield` | Dung lượng thu hồi thực sự bị batch chiếm dụng, tích phân theo thời gian |
| `eviction_events` | Số lần và nguyên nhân, giúp nhận diện các node có tải sản xuất quá biến động để co-location |
| `drift` | Phần đóng góp của node vào $D(t)$ (Mục 5.3) |

### C.3. Các bất biến Kalena bảo đảm với Kuberina

1. Vị trí của workload sản xuất không bao giờ bị thay đổi.
2. `requests` của workload sản xuất không bao giờ bị thay đổi.
3. Trục xuất mọi workload theo lô khôi phục từng node về đúng trạng thái blueprint.
4. Không ràng buộc anti-affinity nào của tác vụ sản xuất bị vi phạm bởi một phép đặt chỗ của Kalena.
5. Không độ skew topology nào của tác vụ sản xuất bị thay đổi bởi một phép đặt chỗ của Kalena.
6. Workload DaemonSet không bao giờ bị trục xuất.
7. Không có việc tái sinh blueprint nào được kích hoạt tự động. Độ trôi được báo cáo, và việc hoạch định lại vẫn là hành động có người gác cổng, bảo toàn tính khả duyệt vốn là đóng góp chính mà Kuberina tự nêu.
