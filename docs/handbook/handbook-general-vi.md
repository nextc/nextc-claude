# Cẩm nang AI — Thông tin chung

> Hướng dẫn của công ty về việc sử dụng AI một cách hiệu quả và có trách nhiệm.

## Viết Prompt — Những lầm tưởng phổ biến gây tác dụng ngược

Nhiều thủ thuật viết prompt phổ biến có vẻ hữu ích, nhưng thực chất lại làm giảm chất lượng đầu ra của AI. Chúng đánh lừa *bạn* rằng kết quả tốt hơn, trong khi lại phá hoại khả năng suy luận của mô hình.

### 1. Thủ thuật "Đóng vai Chuyên gia"

Yêu cầu AI "hành động như một chuyên gia" chỉ thay đổi cách nó nói chuyện, chứ không phải cách nó suy nghĩ. Nó áp dụng một giọng điệu tự tin, có thẩm quyền — nhưng sự tự tin đó không được củng cố bởi khả năng suy luận tốt hơn. Tệ hơn nữa, nó kìm hãm sự dè dặt tự nhiên của AI, vì vậy khi không biết điều gì đó, nó sẽ bịa đặt thay vì thừa nhận.

Ứng dụng hợp lệ duy nhất của prompt đóng vai là **thu hẹp ngữ cảnh**: nói "với tư cách là một kiến trúc sư cơ sở dữ liệu" giúp AI khai thác đúng kiến thức chuyên ngành. Nhưng điều đó khác với việc yêu cầu nó "trở thành một chuyên gia" để có được câu trả lời tốt hơn.

| Nên | Không nên |
|---|---|
| Chỉ định các thông số của tác vụ — đối tượng, định dạng, ràng buộc, độ dài | Yêu cầu AI "hành động như một chuyên gia" với kỳ vọng độ chính xác cao hơn |
| Sử dụng việc đóng vai để thu hẹp ngữ cảnh (ví dụ: "với tư cách là kiến trúc sư cơ sở dữ liệu" cho các câu hỏi về lược đồ) | Cho rằng prompt đóng vai sẽ làm AI thông minh hơn |
| Chú ý đến việc thiếu sự dè dặt — nếu AI không bao giờ nói "điều đó còn tùy" hoặc "tôi không chắc chắn", nó có thể đang quá tự tin | Tin tưởng các câu trả lời chỉ vì chúng nghe có vẻ có thẩm quyền |
| Cho phép AI được nói "Tôi không biết" | Đánh đồng giọng điệu tự tin với nội dung chính xác |

### 2. Prompt phủ định

Việc bảo AI *không* nên làm gì sẽ buộc nó phải chú ý chính xác vào điều mà bạn muốn nó tránh. Kết quả là văn bản lủng củng, lảng tránh và cứ xoay quanh chủ đề bị cấm.

| Nên | Không nên |
|---|---|
| Nêu rõ điều bạn muốn AI tập trung vào (ví dụ: "Tập trung vào lộ trình sản phẩm và các kế hoạch tương lai") | Liệt kê những điều cần tránh (ví dụ: "Không đề cập đến khó khăn tài chính, không sử dụng từ phá sản") |

### 3. Áp lực Cảm xúc & Mua chuộc

"Công việc của tôi phụ thuộc vào điều này" hoặc "Tôi sẽ boa cho bạn 200 đô la" không làm cho AI cố gắng hơn. Điều đó khiến nó trở nên lo lắng và dài dòng — nhồi nhét vào câu trả lời bằng các cảnh báo, xin lỗi và lời lẽ sáo rỗng thay vì cải thiện nội dung thực tế.

| Nên | Không nên |
|---|---|
| Rõ ràng và cụ thể về những gì bạn cần | Thêm áp lực cảm xúc hoặc phần thưởng giả vào prompt |
| Đánh giá kết quả bằng thực chất nội dung, không phải qua sự nhiệt tình chiều lòng | Nhầm lẫn giữa việc dài dòng và những lời trấn an với chất lượng tốt hơn |

### 4. Giới hạn số từ nghiêm ngặt

AI tạo ra văn bản theo token, không phải theo từ. Yêu cầu "chính xác 312 từ" buộc nó phải hy sinh chất lượng — cắt bỏ các điểm quan trọng hoặc lặp lại chính nó để đạt được một con số tùy ý.

| Nên | Không nên |
|---|---|
| Sử dụng các khoảng ước chừng ("khoảng 200-300 từ", "giữ dưới 500 từ") | Yêu cầu số từ chính xác |
| Chỉ định độ sâu thay vì độ dài ("cung cấp cái nhìn tổng quan ngắn gọn" so với "giải thích chi tiết") | Cho rằng đầu ra dài hơn nghĩa là kết quả tốt hơn |

### 5. Ràng buộc Quá mức (Siêu Prompt)

AI nhớ tốt phần đầu và phần cuối của một prompt, nhưng sự chú ý giảm dần ở phần giữa. Một bức tường gồm 15 quy tắc với 6 ngoại lệ dẫn đến việc AI định dạng xuất sắc nhưng lại bịa đặt về thông tin thực tế.

| Nên | Không nên |
|---|---|
| Giữ cho các prompt tập trung — một mục tiêu rõ ràng với các ràng buộc quan trọng nhất | Viết một prompt dài hai trang bao gồm mọi trường hợp ngoại lệ có thể xảy ra |
| Đặt các hướng dẫn quan trọng nhất của bạn ở đầu hoặc cuối prompt | Chôn vùi các yêu cầu chính ở giữa một danh sách dài |
| Chia nhỏ các yêu cầu phức tạp thành một chuỗi các prompt đơn giản hơn | Cố gắng giải quyết mọi thứ trong một siêu prompt duy nhất |

### 6. Lạm dụng "Hãy suy nghĩ từng bước"

Prompt dạng chuỗi suy luận (Chain-of-thought) thực sự hữu ích với các vấn đề toán học và logic. Nhưng áp dụng nó vào các sự kiện đơn giản hoặc các tác vụ sáng tạo sẽ buộc AI phải phát minh ra các lý lẽ ở những nơi không cần thiết — điều này có thể dẫn nó đến một câu trả lời sai.

| Nên | Không nên |
|---|---|
| Sử dụng "hãy suy nghĩ từng bước" cho toán học, logic và các tác vụ suy luận nhiều bước | Thêm nó vào mọi prompt như một công cụ kỳ diệu để tăng độ chính xác |
| Để các câu hỏi đơn giản nhận được các câu trả lời đơn giản | Buộc AI phải trình bày quá trình làm việc khi câu trả lời đã rõ ràng |

## Viết Prompt — Những nguyên tắc cơ bản thực tế

### 7. Cung cấp Ngữ cảnh, Đừng ra Lệnh

AI càng biết nhiều về tình huống của bạn, đầu ra của nó càng phù hợp. Một mệnh lệnh trần trụi sẽ chỉ nhận được một câu trả lời chung chung.

| Nên | Không nên |
|---|---|
| "Tóm tắt nội dung này cho đội ngũ bán hàng đang chuẩn bị cho cuộc gọi khách hàng với CEO của một công ty bán lẻ" | "Tóm tắt nội dung này" |
| "Soạn một email từ chối gửi cho nhà cung cấp mà chúng ta muốn giữ mối quan hệ tốt đẹp" | "Viết một email từ chối" |

### **8. ⚠️ QUAN TRỌNG: Mô tả Vấn đề, Không phải Giải pháp**

Đây là thói quen viết prompt có tác động lớn nhất mà bạn có thể áp dụng. Các mô hình AI hiện đại là những cỗ máy giải quyết vấn đề mạnh mẽ — chúng có thể suy luận, khám phá các lựa chọn và sáng tạo. Nhưng chỉ khi bạn cho phép chúng làm vậy.

Khi bạn chỉ định quá chi tiết về *cách* làm một việc gì đó, bạn biến AI thành một người đánh máy chỉ biết làm theo lệnh. Khi bạn mô tả *những gì* bạn cần và *tại sao*, bạn mở khóa khả năng tìm ra các giải pháp mà bạn chưa từng nghĩ tới của nó. Điều này đặc biệt đúng đối với công việc sáng tạo (UI/UX, thiết kế, viết lách) và các tác vụ điều phối phức tạp.

| Nên | Không nên |
|---|---|
| "Tôi cần một màn hình cài đặt có cảm giác trực quan cho người dùng không am hiểu kỹ thuật. Đây là những gì họ cần cấu hình: [danh sách]" | "Đặt một công tắc bật/tắt ở góc trên bên phải, sử dụng menu thả xuống cho X, thêm nút lưu ở dưới cùng" |
| Nói cho AI biết bạn cần kết quả gì và tại sao — hãy để nó tự tìm ra cách thực hiện | Ra lệnh từng bước thực hiện trong khi AI đã có ngữ cảnh để tự quyết định |
| Đưa ra các ràng buộc quan trọng (nguyên tắc thương hiệu, khả năng tiếp cận, hiệu suất) và để AI sáng tạo trong phạm vi đó | Chỉ định quá mức về bố cục, cấu trúc hoặc phương pháp tiếp cận khi bạn không chắc chắn điều gì là tốt nhất |
| Đối với các tác vụ máy móc (đổi tên cái này, định dạng lại cái kia), hãy cụ thể. Đối với các tác vụ sáng tạo hoặc phức tạp, hãy mô tả đích đến, đừng mô tả lộ trình. | Đối xử với mọi tương tác AI theo cùng một cách, bất kể loại tác vụ là gì |

### 9. Trình bày, Đừng chỉ mô tả

Việc cung cấp cho AI một ví dụ về những gì bạn muốn sẽ nhanh hơn và chính xác hơn so với việc mô tả nó bằng lời.

| Nên | Không nên |
|---|---|
| Dán một email trước đó mà bạn thích và nói "hãy viết theo giọng văn này" | "Viết nó với giọng điệu chuyên nghiệp nhưng thân thiện" |
| Đưa ra một định dạng bảng mẫu và nói "hãy làm theo cấu trúc này" | Dành cả một đoạn văn để mô tả bố cục mong muốn của bạn |

### 10. Tinh chỉnh dần, Đừng bắt đầu lại

Khi kết quả đã gần sát nhưng chưa chính xác, hãy tinh chỉnh nó — đừng vứt bỏ và làm lại từ đầu.

| Nên | Không nên |
|---|---|
| "Tốt rồi, nhưng hãy làm cho đoạn thứ hai ngắn hơn và thay thế thuật ngữ chuyên ngành bằng ngôn ngữ phổ thông" | Viết lại toàn bộ prompt của bạn chỉ vì kết quả đã đúng 80% |
| Phát triển dựa trên những gì AI đã làm đúng, sửa chữa những gì nó làm sai | Bắt đầu một cuộc trò chuyện mới mỗi khi bạn không hài lòng |

### 11. Kiểm chứng các Con số, Tên riêng và Liên kết

AI có thể tự tin bịa ra các số liệu thống kê, trích dẫn, URL và tên riêng. Hãy coi mọi tuyên bố về sự thật là chưa được xác minh cho đến khi bạn kiểm tra nó.

| Nên | Không nên |
|---|---|
| Hỏi "bạn lấy con số 43% đó ở đâu?" — nếu nó không thể trích dẫn nguồn thực tế, đừng sử dụng nó | Sao chép-dán số liệu do AI tạo ra vào bài thuyết trình với khách hàng |
| Kiểm tra chéo các tên riêng, ngày tháng và liên kết trước khi chia sẻ | Cho rằng giọng điệu tự tin của AI đồng nghĩa với việc thông tin là chính xác |

### 12. Biết điểm dừng

Nếu AI không thể làm đúng sau vài lần thử, việc viết thêm prompt sẽ không khắc phục được vấn đề.

| Nên | Không nên |
|---|---|
| Sau 3 lần thử nghiệm, hãy lùi lại — suy nghĩ lại về tác vụ, chia nhỏ nó ra hoặc tự mình làm | Dành 30 phút để viết lại prompt cho cùng một câu hỏi theo 10 cách khác nhau |
| Thử chia nhỏ một tác vụ phức tạp thành các phần nhỏ hơn mà AI có thể xử lý | Tiếp tục thêm nhiều hướng dẫn hơn với hy vọng lần thử tiếp theo sẽ hoàn hảo |

### 13. Không bao giờ dán Dữ liệu Bảo mật

Hãy giả định rằng bất cứ thứ gì bạn dán vào công cụ AI đều có thể bị lưu trữ, ghi nhật ký hoặc bị người khác nhìn thấy.

| Nên | Không nên |
|---|---|
| Ẩn danh dữ liệu: "Doanh thu Công ty A: $X, Công ty B: $Y" | Dán dữ liệu tài chính thực: "Đây là chi tiết doanh thu quý 3 của chúng tôi" |
| Sử dụng tên thay thế cho nhân sự, khách hàng và các dự án nội bộ | Chia sẻ thông tin nhận dạng cá nhân (PII) của khách hàng, thông tin đăng nhập hoặc tài liệu chiến lược nội bộ |

### 14. AI khuếch đại Phán đoán của bạn

AI hữu ích nhất khi bạn có thể đánh giá xem đầu ra của nó có đúng hay không. Nó nguy hiểm nhất khi bạn không thể làm điều đó.

| Nên | Không nên |
|---|---|
| Sử dụng AI cho các tác vụ mà bạn có thể phát hiện ra lỗi — soạn thảo, tìm kiếm ý tưởng, định dạng lại, tóm tắt | Yêu cầu AI xem xét một hợp đồng pháp lý nếu bạn không thể đánh giá xem lời khuyên của nó có chính xác hay không |
| Sử dụng nó để tăng tốc công việc mà bạn đã biết cách làm | Dựa vào nó để đưa ra quyết định trong những lĩnh vực mà bạn không am hiểu |

### 15. Bắt đầu mới cho mỗi Tác vụ

Mọi công cụ AI đều có một cửa sổ ngữ cảnh — một lượng giới hạn các đoạn hội thoại mà nó có thể "nhớ". Khi một cuộc trò chuyện trở nên quá dài, công cụ sẽ nén các tin nhắn cũ hơn để nhường chỗ. Mỗi lần nén sẽ làm mất đi các sắc thái và chi tiết. Điều này được gọi là **hiện tượng mục nát ngữ cảnh (context rot)**.

Cách khắc phục rất đơn giản: một tác vụ, một cuộc trò chuyện.

| Nên | Không nên |
|---|---|
| Bắt đầu một cuộc trò chuyện mới khi chuyển sang một chủ đề hoặc tác vụ khác | Giữ cho một cuộc trò chuyện dài tiếp diễn xuyên suốt nhiều chủ đề không liên quan |
| Coi mỗi cuộc trò chuyện là một phiên làm việc tập trung với một mục tiêu duy nhất | Cho rằng AI nhớ toàn bộ chi tiết về những gì bạn đã thảo luận 200 tin nhắn trước |