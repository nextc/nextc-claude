# Sổ tay AI — Tổng quan

> Hướng dẫn của công ty về việc sử dụng AI hiệu quả và có trách nhiệm.

## Prompting — Những lầm tưởng phổ biến gây tác dụng ngược

Nhiều thủ thuật prompting phổ biến trông có vẻ hữu ích, nhưng thực ra làm giảm chất lượng đầu ra của AI. Chúng đánh lừa *bạn* rằng kết quả tốt hơn, trong khi phá hoại khả năng suy luận của mô hình.

### 1. Thủ thuật "Expert Persona"

Bảo AI "act as an expert" thay đổi cách nó nghe, không phải cách nó nghĩ. Nó dùng giọng tự tin, có thẩm quyền — nhưng sự tự tin đó không được chống lưng bởi suy luận tốt hơn. Tệ hơn, nó kìm nén sự dè dặt tự nhiên của AI, nên khi không biết điều gì đó, nó có thể nói bừa thay vì thừa nhận.

Cách dùng persona prompt hợp lệ duy nhất là **thu hẹp ngữ cảnh**: nói "as a database architect" giúp AI rút kiến thức từ đúng lĩnh vực. Nhưng điều đó khác với việc bảo nó "be an expert" để có câu trả lời tốt hơn.

| Nên | Không nên |
|---|---|
| Chỉ định tham số của tác vụ — đối tượng đọc, định dạng, ràng buộc, độ dài | Bảo AI "act as an expert" và kỳ vọng độ chính xác cao hơn |
| Dùng persona để thu hẹp ngữ cảnh (ví dụ "as a database architect" cho câu hỏi về schema) | Cho rằng persona prompt làm AI thông minh hơn |
| Để ý khi thiếu sự dè dặt — nếu AI không bao giờ nói "còn tùy" hoặc "tôi không chắc", nó có thể đang quá tự tin | Tin câu trả lời chỉ vì chúng nghe có vẻ thẩm quyền |
| Cho AI quyền được nói "Tôi không biết" | Đánh đồng giọng tự tin với nội dung đúng |

### 2. Prompt phủ định

Bảo AI những gì *không* được làm buộc nó chú ý đúng vào thứ bạn muốn tránh. Kết quả là văn bản vụng về, né tránh, cứ đi vòng quanh chủ đề bị cấm.

| Nên | Không nên |
|---|---|
| Nêu điều bạn muốn AI tập trung vào (ví dụ "Tập trung vào roadmap sản phẩm và kế hoạch tương lai") | Liệt kê điều cần tránh (ví dụ "Không nhắc đến khó khăn tài chính, không dùng từ phá sản") |

### 3. Áp lực cảm xúc & hối lộ

"Công việc của tôi phụ thuộc vào việc này" hoặc "Tôi sẽ boa bạn $200" không làm AI cố gắng hơn. Nó làm AI lo lắng và dài dòng — nhồi thêm cảnh báo, xin lỗi, và lời thừa thay vì cải thiện nội dung thật sự.

| Nên | Không nên |
|---|---|
| Nói rõ ràng và cụ thể về thứ bạn cần | Thêm áp lực cảm xúc hoặc phần thưởng giả vào prompt |
| Đánh giá đầu ra bằng thực chất của nó, không phải bằng mức độ sốt sắng làm vừa lòng | Nhầm độ dài và lời trấn an thêm với chất lượng tốt hơn |

### 4. Giới hạn số từ nghiêm ngặt

AI tạo văn bản bằng token, không phải từ. Yêu cầu "chính xác 312 từ" buộc nó hy sinh chất lượng — cắt bỏ điểm quan trọng hoặc lặp lại để đạt một mục tiêu tùy ý.

| Nên | Không nên |
|---|---|
| Dùng khoảng gần đúng ("khoảng 200-300 từ", "giữ dưới 500 từ") | Đòi số từ chính xác |
| Chỉ định độ sâu thay vì độ dài ("cho tổng quan ngắn" thay vì "giải thích chi tiết") | Cho rằng đầu ra dài hơn nghĩa là đầu ra tốt hơn |

### 5. Ràng buộc quá mức (Mega-Prompt)

AI nhớ phần đầu và cuối của prompt tốt, nhưng sự chú ý giảm ở phần giữa. Một bức tường 15 rule với 6 ngoại lệ có thể khiến AI làm đúng định dạng nhưng bịa sự thật.

| Nên | Không nên |
|---|---|
| Giữ prompt tập trung — một mục tiêu rõ với các ràng buộc quan trọng nhất | Viết prompt dài hai trang bao phủ mọi trường hợp biên có thể |
| Đặt chỉ dẫn tối quan trọng ở đầu hoặc cuối prompt | Chôn yêu cầu chính ở giữa một danh sách dài |
| Chia yêu cầu phức tạp thành một chuỗi prompt đơn giản hơn | Cố giải quyết mọi thứ trong một mega-prompt duy nhất |

### 6. Dùng "Think Step-by-Step" ở mọi nơi

Prompt chain-of-thought thật sự hữu ích với bài toán toán học và logic. Nhưng áp dụng nó cho sự kiện đơn giản hoặc tác vụ sáng tạo sẽ ép AI phát minh suy luận ở nơi không cần — và có thể tự thuyết phục nó đi tới câu trả lời sai.

| Nên | Không nên |
|---|---|
| Dùng "think step-by-step" cho toán học, logic, và tác vụ suy luận nhiều bước | Thêm nó vào mọi prompt như một bùa tăng độ chính xác |
| Để câu hỏi đơn giản nhận câu trả lời đơn giản | Ép AI trình bày cách làm khi câu trả lời vốn thẳng thắn |

## Prompting — Nguyên tắc thực tế

### 7. Cho ngữ cảnh, đừng chỉ ra lệnh

AI càng biết nhiều về tình huống của bạn, đầu ra càng phù hợp. Một mệnh lệnh trơ trọi sẽ nhận câu trả lời chung chung.

| Nên | Không nên |
|---|---|
| "Tóm tắt nội dung này cho đội sales đang chuẩn bị cuộc gọi với CEO của một công ty bán lẻ" | "Tóm tắt nội dung này" |
| "Soạn email từ chối cho một vendor mà chúng ta muốn giữ quan hệ tốt" | "Viết email từ chối" |

### **8. ⚠️ QUAN TRỌNG: Mô tả vấn đề, không phải giải pháp**

Đây là thói quen prompting có tác động lớn nhất mà bạn có thể áp dụng. Các mô hình AI hiện đại là những bộ giải quyết vấn đề mạnh — chúng có thể suy luận, khám phá lựa chọn, và sáng tạo. Nhưng chỉ khi bạn để chúng làm vậy.

Khi bạn chỉ định quá cụ thể *cách* làm một việc, bạn hạ AI xuống thành người đánh máy làm theo lệnh. Khi bạn mô tả *điều gì* bạn cần và *tại sao*, bạn mở khóa khả năng của nó trong việc tìm ra các giải pháp bạn chưa từng nghĩ tới. Điều này đặc biệt đúng với công việc sáng tạo (UI/UX, thiết kế, viết) và các tác vụ điều phối phức tạp.

| Nên | Không nên |
|---|---|
| "Tôi cần một màn hình cài đặt có cảm giác trực quan cho người dùng không rành kỹ thuật. Đây là những gì họ cần cấu hình: [list]" | "Đặt toggle ở góc trên bên phải, dùng dropdown cho X, thêm nút save ở dưới cùng" |
| Nói cho AI biết kết quả bạn cần và vì sao — để nó tự tìm cách làm | Đọc chính tả từng bước triển khai khi AI đã có ngữ cảnh để quyết định |
| Đưa ràng buộc có ý nghĩa (brand guidelines, accessibility, performance) và để AI sáng tạo trong ranh giới đó | Chỉ định quá mức về layout, cấu trúc, hoặc cách tiếp cận khi bạn không chắc điều gì là tốt nhất |
| Với tác vụ cơ học (đổi tên cái này, format lại cái kia), hãy cụ thể. Với tác vụ sáng tạo hoặc phức tạp, hãy mô tả đích đến, không phải tuyến đường. | Đối xử mọi tương tác AI theo cùng một cách bất kể loại tác vụ |

### 9. Cho xem, đừng chỉ mô tả

Cho AI một ví dụ về thứ bạn muốn sẽ nhanh hơn và chính xác hơn việc mô tả bằng lời.

| Nên | Không nên |
|---|---|
| Dán một email cũ bạn thích và nói "match this tone" | "Viết với giọng chuyên nghiệp nhưng thân thiện" |
| Cho một định dạng bảng mẫu và nói "follow this structure" | Dành cả đoạn văn mô tả layout mong muốn |

### 10. Lặp lại, đừng khởi động lại

Khi đầu ra đã gần đúng nhưng chưa đúng hẳn, hãy tinh chỉnh nó — đừng vứt bỏ và bắt đầu lại từ đầu.

| Nên | Không nên |
|---|---|
| "Tốt rồi, nhưng làm đoạn thứ hai ngắn hơn và thay thuật ngữ chuyên ngành bằng ngôn ngữ đời thường" | Viết lại toàn bộ prompt chỉ vì đầu ra đã đúng 80% |
| Xây tiếp trên phần AI đã làm đúng, sửa phần nó làm sai | Bắt đầu cuộc trò chuyện mới mỗi lần bạn chưa hài lòng |

### 11. Xác minh số liệu, tên riêng, và liên kết

AI có thể tự tin bịa số liệu thống kê, trích dẫn, URL, và tên riêng. Hãy coi mọi khẳng định thực tế là chưa được xác minh cho tới khi bạn kiểm tra.

| Nên | Không nên |
|---|---|
| Hỏi "bạn lấy số 43% đó ở đâu?" — nếu nó không thể dẫn nguồn thật, đừng dùng số đó | Copy-paste số liệu AI tạo vào bài thuyết trình cho khách hàng |
| Kiểm tra chéo tên, ngày, và link trước khi chia sẻ | Cho rằng giọng tự tin của AI nghĩa là dữ kiện đúng |

### 12. Biết khi nào nên dừng

Nếu AI không thể làm đúng sau vài lần thử, thêm prompt sẽ không sửa được vấn đề.

| Nên | Không nên |
|---|---|
| Sau 3 lần thử, lùi lại — suy nghĩ lại tác vụ, chia nhỏ nó, hoặc tự làm | Dành 30 phút reprompt cùng một câu hỏi theo 10 cách khác nhau |
| Thử chia tác vụ phức tạp thành các phần nhỏ hơn mà AI xử lý được | Tiếp tục thêm nhiều chỉ dẫn với hy vọng lần sau sẽ hoàn hảo |

### 13. Không bao giờ dán dữ liệu mật

Giả định rằng bất cứ thứ gì bạn dán vào công cụ AI đều có thể được lưu trữ, ghi log, hoặc người khác nhìn thấy.

| Nên | Không nên |
|---|---|
| Ẩn danh dữ liệu: "Doanh thu Company A: $X, Company B: $Y" | Dán số liệu tài chính thật: "Đây là phân rã doanh thu Q3 của chúng ta" |
| Dùng tên placeholder cho con người, khách hàng, và dự án nội bộ | Chia sẻ PII của khách hàng, credential, hoặc tài liệu chiến lược nội bộ |

### 14. AI khuếch đại phán đoán của bạn

AI hữu ích nhất khi bạn có thể đánh giá đầu ra của nó có đúng hay không. Nó nguy hiểm nhất khi bạn không thể.

| Nên | Không nên |
|---|---|
| Dùng AI cho tác vụ mà bạn có thể phát hiện lỗi — soạn nháp, brainstorm, format lại, tóm tắt | Nhờ AI review hợp đồng pháp lý nếu bạn không thể đánh giá lời khuyên của nó đúng hay sai |
| Dùng nó để tăng tốc công việc bạn vốn đã biết làm | Dựa vào nó để quyết định trong lĩnh vực bạn không hiểu |

### 15. Bắt đầu mới cho mỗi tác vụ

Mọi công cụ AI đều có cửa sổ ngữ cảnh — một lượng hội thoại hữu hạn mà nó có thể "nhớ". Khi cuộc trò chuyện quá dài, công cụ sẽ nén các tin nhắn cũ để tạo chỗ. Mỗi lần nén đều làm mất sắc thái và chi tiết. Hiện tượng này được gọi là **context rot**.

Cách sửa rất đơn giản: một tác vụ, một cuộc trò chuyện.

| Nên | Không nên |
|---|---|
| Bắt đầu cuộc trò chuyện mới khi chuyển sang chủ đề hoặc tác vụ khác | Giữ một cuộc trò chuyện dài chạy qua nhiều chủ đề không liên quan |
| Xem mỗi cuộc trò chuyện là một phiên tập trung với một mục tiêu duy nhất | Cho rằng AI nhớ đầy đủ chi tiết của những gì bạn đã thảo luận cách đây 200 tin nhắn |
