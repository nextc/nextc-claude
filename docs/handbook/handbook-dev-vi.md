# Sổ tay AI — Dev

> Hướng dẫn kỹ thuật cho phát triển phần mềm với sự hỗ trợ của AI.

## Làm việc với công cụ lập trình AI

Các mẹo này dùng Claude Code làm ví dụ tham chiếu, nhưng khái niệm cũng áp dụng cho Cursor, Copilot, Windsurf, và các công cụ lập trình AI khác.

### 1. Chủ động quản lý hội thoại dài

Hội thoại dài là điều khó tránh — tính năng phức tạp, gỡ lỗi nhiều bước. Khi điều đó xảy ra, hãy tự kiểm soát quá trình nén ngữ cảnh.

| Nên | Không nên |
|---|---|
| Theo dõi mức dùng ngữ cảnh và chủ động nén sớm | Để auto-compact tự quyết định phải giữ gì |
| Hướng dẫn khi nén: `/compact Keep the data model, API contract, and current hypothesis` | Nén mà không hướng dẫn — bạn sẽ nhận một bản tóm tắt chung chung |
| Kiểm tra sau khi nén: "Cách tiếp cận hiện tại của chúng ta cho X là gì?" | Mặc định tin rằng mọi thứ đều còn nguyên |

### 2. Không bao giờ nén giữa chừng một tác vụ

Nén ngữ cảnh khi đang triển khai là cách nhanh nhất để làm chệch hướng phiên làm việc. AI sẽ mất tên biến, đường dẫn tệp, và trạng thái dang dở.

| Nên | Không nên |
|---|---|
| Nén giữa các tác vụ đã hoàn tất — sau một tính năng, sau một mốc gỡ lỗi | Nén khi đang sửa file hoặc đang gỡ lỗi |
| Dùng `/clear` để reset tức thì miễn phí giữa các tác vụ không liên quan | Dùng `/compact` khi `/clear` đã đủ |
| Nén tại các điểm dừng hợp lý: sau nghiên cứu, sau mốc quan trọng, sau các cách tiếp cận thất bại | Nén chỉ vì thanh ngữ cảnh trông có vẻ đầy |

### 3. Dùng Plan Mode cho tác vụ lớn

**Shift + Tab** vào Plan Mode — Claude có thể đọc và nghiên cứu nhưng không thể sửa file cho tới khi bạn phê duyệt.

| Nên | Không nên |
|---|---|
| Dùng Plan Mode cho tính năng nhiều file, refactor, hoặc thay đổi kiến trúc | Để Claude bắt đầu sửa ngay trên các tác vụ phức tạp |
| Đọc kế hoạch và lặp lại trước khi phê duyệt | Phê duyệt kế hoạch đầu tiên mà không đọc |
| Bỏ qua Plan Mode cho thay đổi nhỏ, rõ ràng — nó tạo thêm chi phí điều phối | Dùng Plan Mode cho một sửa lỗi một dòng |

### 4. Kiểm soát chi phí

| Thành phần | Chi phí | Lý do |
|---|---|---|
| **Skills & agents** | Rẻ | Nạp theo nhu cầu. Cài 200 skill = chi phí nền tối thiểu. |
| **MCPs** | Vừa phải | Trì hoãn việc nạp công cụ. Ban đầu chỉ nạp tên server/tool. |
| **Rules** | Đắt | Được nạp vào mọi prompt, mọi lần. |
| **Hook dùng AI** | Đắt | Chạy trên mọi prompt. Hook không dùng AI thì ổn. |

| Nên | Không nên |
|---|---|
| Cài bao nhiêu skill tùy nhu cầu | Lo lắng về số lượng skill |
| Giữ rule thật tối thiểu — chỉ những gì phải áp dụng cho mọi cuộc trò chuyện | Thêm các rule "có thì tốt" làm phình to mọi prompt |
| Chỉ giữ MCP bạn thật sự dùng | Bật hàng chục MCP "phòng khi cần" |
| Giữ hook đơn giản và không dùng AI | Thêm hook dùng AI chạy trên mọi prompt |

### 5. Mỗi agent chỉ nên có một trách nhiệm

Agent phạm vi hẹp với công việc rõ ràng hiệu quả hơn mega-agent cố làm mọi thứ.

| Nên | Không nên |
|---|---|
| Giao cho mỗi agent một trách nhiệm duy nhất, được định nghĩa rõ | Tạo agent xử lý "review + testing + deployment + docs" |
| Kết hợp các agent hẹp bằng orchestration cho tác vụ phức tạp | Xây một agent khổng lồ cho mọi trường hợp biên |
| Giữ mô tả agent dưới 500 token | Viết mô tả dài như tiểu thuyết làm tốn ngữ cảnh |

### 6. Tự động hóa workflow nhiều tác vụ

Khi bạn có một kế hoạch có cấu trúc (ví dụ một file `sprint1.md` với các giai đoạn và tác vụ), hãy dùng **ralph-loop** để AI tự động: hoàn thành tác vụ, đánh dấu đã xong, chuyển sang giai đoạn tiếp theo. Bắt đầu với `/ralph-loop`.

| Nên | Không nên |
|---|---|
| Dùng tự động hóa khi kế hoạch rõ ràng và có cấu trúc | Tự điều khiển từng tác vụ khi kế hoạch đã được trình bày sẵn |
| Chia kế hoạch thành các giai đoạn với tác vụ rời rạc, được định nghĩa rõ | Đưa cho loop một kế hoạch mơ hồ rồi kỳ vọng nó tự tìm ra chi tiết |

---

## Claude Code — Thiết lập, cấu hình & lệnh

### 7. Thiết lập terminal của bạn

Phiên bản terminal hỗ trợ tmux, chia pane, và điều phối nhóm. Sau khi cài đặt, chạy các lệnh này bên trong Claude:

- **`/terminal-setup`** — cấu hình Shift+Enter cho nhập liệu nhiều dòng
- **`/statusline`** — thêm thanh trạng thái với model, mức dùng ngữ cảnh, và thông tin phiên

| Nên | Không nên |
|---|---|
| Chạy `/terminal-setup` và `/statusline` trong lần thiết lập đầu | Bỏ qua rồi thắc mắc vì sao nhập nhiều dòng không hoạt động |
| Dùng phiên bản terminal với tmux cho workflow nâng cao | Tự giới hạn trong extension của IDE |

### 8. Bật sandboxing

Sandboxing cho phép AI thực thi lệnh trong một môi trường bị giới hạn — nó có thể làm việc tự do trong các ranh giới an toàn mà không phải xin phép ở từng bước. Claude Code dùng cơ chế cô lập cấp hệ điều hành (SeatBelt của Apple trên macOS).

| Nên | Không nên |
|---|---|
| Bật sandboxing với ranh giới filesystem/network rõ ràng | Chạy không có sandboxing và phê duyệt thủ công mọi lệnh |
| Giới hạn quyền ghi vào thư mục dự án và cache của công cụ | Cấp quyền ghi trọn gói vào thư mục home |
| Xem lại và siết cấu hình mặc định | Sao chép cấu hình của người khác mà không hiểu |

**Cấu hình ví dụ** (`~/.claude/settings.json` hoặc `.claude/settings.json`):

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowUnixSockets": ["/private/tmp/tmux-501/default"]
    },
    "filesystem": {
      "allowWrite": [
        "/Users/<you>/.claude",
        "/private/tmp/tmux-501/"
      ],
      "allowRead": [
        "/Users/<you>/.pub-cache",
        "/Users/<you>/.flutter",
        "/Users/<you>/.config/flutter",
        "/Users/<you>/.gradle",
        "/Users/<you>/.npm",
        "/Users/<you>/.cache"
      ]
    }
  }
}
```

Điều chỉnh đường dẫn đọc/ghi cho stack của bạn. Ví dụ trên phù hợp với Flutter/Node.js.

### 9. Hiểu ba phạm vi cấu hình

Settings được xếp theo lớp — mỗi phạm vi ghi đè phạm vi phía trên nó.

| Phạm vi | Vị trí | Mục đích |
|---|---|---|
| **Global** | `~/.claude/settings.json` | Mặc định của bạn trên tất cả dự án |
| **Project** | `.claude/settings.json` | Thiết lập của nhóm, được commit vào repo |
| **Local** | `.claude/settings.local.json` | Ghi đè cá nhân, được gitignore |

| Nên | Không nên |
|---|---|
| Đặt quy ước của nhóm trong phạm vi project | Đặt thiết lập của nhóm trong config global của bạn |
| Dùng phạm vi local cho tùy chọn cá nhân | Commit `.claude/settings.local.json` |
| Giữ phạm vi global gọn nhẹ | Nhét mọi thứ vào global |

### 10. Rà soát cấu hình của bạn

Chạy `/config` để duyệt mọi thiết lập. Các mục quan trọng:

| Thiết lập | Khuyến nghị | Lý do |
|---|---|---|
| **auto-compact** | Tắt | Nén thủ công với `/compact [prompt]` để kiểm soát những gì được giữ lại. |
| **output style** | Tùy bạn | `default` = ngắn gọn. `explanatory` = giải thích lựa chọn. `learning` = học từ quyết định của bạn. |
| **default teammate model** | Sonnet | Opus là mặc định nhưng đắt hơn đáng kể. Sonnet xử lý tốt hầu hết tác vụ. |

| Nên | Không nên |
|---|---|
| Đi qua `/config` trong lần thiết lập đầu | Dùng mặc định mà không hiểu chúng |
| Tắt auto-compact | Để auto-compact âm thầm làm suy giảm ngữ cảnh |
| Đặt teammate model thành Sonnet | Để Opus cho mọi sub-task |

### 11. Biết các lệnh thiết yếu

| Lệnh | Tác dụng |
|---|---|
| `/usage` | Kiểm tra lượng token tiêu thụ cho phiên hiện tại |
| `/context` | Xem những gì đang được nạp — rules, MCPs, tools, lịch sử hội thoại |
| `/clear` | Reset hội thoại mà không đóng phiên — miễn phí và tức thì |
| `/config` | Duyệt và thay đổi thiết lập |
| `/plugin` | Quản lý plugin đã cài |
| `/mcp` | Quản lý MCP server |
| `/hooks` | Xem hook đã cấu hình cho các sự kiện công cụ |
| `/rename` | Đổi tên cuộc trò chuyện hiện tại — hiển thị trên thanh prompt |
| `/resume` | Tiếp tục một cuộc trò chuyện trước đó bằng ID, tên, hoặc chọn từ danh sách |
| `/buddy` | Ấp một thú cưng đồng hành trong terminal của bạn |

| Nên | Không nên |
|---|---|
| Kiểm tra `/usage` thường xuyên | Chờ tới khi chạm giới hạn rồi mới thắc mắc token đã đi đâu |
| Dùng `/context` để gỡ lỗi hành vi bất ngờ | Đoán vì sao AI hành xử khác kỳ vọng |
| Dùng `/clear` giữa các tác vụ không liên quan | Mở phiên terminal mới khi `/clear` đã đủ |

### 12. Checklist cho dự án mới

Đi qua danh sách này trước khi bạn bắt đầu làm việc trong một thư mục dự án mới:

1. **Kiểm tra rules** — đọc `.claude/` để biết ràng buộc và quy ước của dự án
2. **Kiểm tra `/mcp`** — bật những gì bạn cần, tắt những gì bạn không cần
3. **Kiểm tra `/plugin`** — cài những gì nhóm khuyến nghị
4. **Kiểm tra `.claude/settings.json`** — rà soát thiết lập dùng chung của nhóm

| Nên | Không nên |
|---|---|
| Chạy checklist này trên mọi dự án mới | Nhảy vào code rồi thắc mắc vì sao AI hành xử kỳ lạ |
| Đọc rule của dự án để hiểu quy ước nhóm | Cho rằng thiết lập global của bạn bao phủ mọi thứ |
| Xác minh thiết lập MCP và plugin khớp với kỳ vọng của nhóm | Phớt lờ tooling riêng của dự án |

### 13. Vệ sinh bảo mật

Công cụ lập trình AI truy cập filesystem và thực thi lệnh. Hãy xem cấu hình của bạn như một bề mặt tấn công.

| Nên | Không nên |
|---|---|
| Chạy `/security-scan` định kỳ | Cho rằng config của bạn an toàn vì hôm qua nó chạy ổn |
| Không bao giờ hardcode API key trong agents, skills, hoặc rules | Nhúng secret vào file cấu hình sẽ được commit |
| Dùng hook để chặn mẫu secret trong prompt (sk-, ghp_, AKIA) | Dựa vào trí nhớ để tránh dán secret |

### 14. Ưu tiên Skills hơn Rules

Skills chỉ nạp theo nhu cầu khi được gọi. Rules được nạp vào từng prompt một.

| Nên | Không nên |
|---|---|
| Mã hóa workflow tái sử dụng thành skills | Đặt hướng dẫn tùy chọn trong rules |
| Dành rules cho những thứ bắt buộc áp dụng cho mọi cuộc trò chuyện | Dùng rules cho các mối quan tâm riêng của từng tác vụ |
| Định kỳ rà soát rules — chuyển rule thỉnh thoảng mới hữu ích thành skill | Để thư mục rules tăng trưởng không kiểm soát |

### 15. Kiểm soát MCP

Chi phí ngữ cảnh của MCP đã giảm — mô tả công cụ được trì hoãn và chỉ nạp theo nhu cầu. Nhưng mỗi server vẫn thêm overhead, và công cụ được fetch khi AI quyết định dùng chúng.

| Nên | Không nên |
|---|---|
| Giữ dưới 10 MCP server mỗi dự án | Bật hàng chục server và cho rằng nạp trì hoãn nghĩa là miễn phí |
| Tắt server không dùng qua config hoặc `/mcp` | Giữ server được bật cho công cụ bạn dùng mỗi tháng một lần |
| Audit MCP bạn thật sự dùng | Tích lũy server mà không dọn dẹp |

### 16. MCP server được khuyến nghị

Trước khi cài một MCP, kiểm tra xem công cụ tích hợp sẵn đã bao phủ nó chưa.

#### **Bắt buộc nên có:**

| MCP | Lý do | Cài đặt |
|---|---|---|
| **Context7** | Tài liệu sống, đúng theo phiên bản cho hơn 50 framework. Không có tương đương tích hợp sẵn. Không cần API key. | `claude mcp add context7 --scope user -- npx -y @upstash/context7-mcp@latest` |

#### **Theo tình huống — chỉ khi bạn dùng dịch vụ đó:**

| MCP | Cài đặt |
|---|---|
| Supabase | `claude mcp add --transport http supabase https://mcp.supabase.com/mcp` |
| Sentry | `claude mcp add --transport http sentry https://mcp.sentry.dev/mcp` |
| Figma | Qua app desktop Figma hoặc remote MCP |
| Notion | `claude mcp add --transport http notion https://mcp.notion.com/mcp` |

| Nên | Không nên |
|---|---|
| Cài Context7 ở global (`--scope user`) | Cài MCP trùng chức năng với công cụ tích hợp sẵn |
| Ưu tiên công cụ CLI (`gh`, `playwright-cli`) hơn MCP tương đương | Mặc định dùng MCP khi CLI làm được cùng việc |
| Chỉ cài MCP dịch vụ mà bạn chủ động dùng | Cài MCP dịch vụ "phòng khi cần" |

### 17. Cài các CLI mở rộng năng lực

Claude Code kế thừa shell của bạn — mọi CLI đều trở thành một công cụ nó có thể gọi.

#### **Thiết yếu:**

| CLI | Mở khóa khả năng gì | Cài đặt |
|---|---|---|
| **gh** | PR, issue, tìm kiếm GitHub, log CI, workflow. Không có nó, Claude không thể tương tác với GitHub. Chạy `gh auth login` sau khi cài. | `brew install gh` |
| **jq** | Truy vấn JSON trong pipeline shell. Dùng liên tục với `gh`, API, và file cấu hình. | `brew install jq` |

#### **Khuyến nghị:**

| CLI | Mở khóa khả năng gì | Cài đặt |
|---|---|---|
| **shellcheck** | Phân tích tĩnh cho shell script. Bắt lỗi trước khi chúng gây hại. | `brew install shellcheck` |
| **ast-grep** | Tìm kiếm code theo cấu trúc bằng mẫu AST (hơn 20 ngôn ngữ). Tìm được các mẫu không thể diễn đạt bằng regex. | `brew install ast-grep` |
| **yq** | Sửa YAML/TOML có cấu trúc mà vẫn giữ indentation và comment. | `brew install yq` |
| **semgrep** | Quét bảo mật trên hơn 30 ngôn ngữ với hơn 1000 rule. | `brew install semgrep` |
| **[playwright-cli](https://github.com/microsoft/playwright-cli)** | Tự động hóa trình duyệt tối ưu cho coding agent — tiết kiệm token hơn Playwright MCP. | `npm install -g @playwright/cli@latest` |

#### **Thiết lập nhanh:**

```bash
brew install gh jq shellcheck ast-grep yq semgrep
gh auth login
```

| Nên | Không nên |
|---|---|
| Cài `gh` trước và xác thực | Bỏ qua `gh auth login` — `gh` chưa xác thực gần như vô dụng |
| Cài `shellcheck` — Claude viết shell thường xuyên, và lỗi shell có thể phá hoại | Tin rằng shell script của Claude luôn đúng |
| Chỉ cài runtime và CLI cho stack thật sự của bạn | Cài mọi CLI "phòng khi cần" |
