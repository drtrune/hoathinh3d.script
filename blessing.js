// ==UserScript==
// @name         HoatHinh3D Tiên duyên
// @namespace    http://tampermonkey.net/
// @version      2.5
// @description  Mỗi 2 giây, script sẽ kiểm tra trang để tìm khung nhập lời chúc hoặc modal lì xì và thực hiện hành động tương ứng. Tự động dừng script khi phát hiện đã chúc phúc hoặc đã nhận thưởng. KHÔNG TỰ ĐỘNG ĐÓNG LÌ XÌ.
// @author       Bạn
// @match        https://hoathinh3d.gg/phong-cuoi*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Blessing] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Cấu hình ---
    const WEDDING_BLESSING_MESSAGE = "Chúc mừng hạnh phúc hai bạn! Chúc hai bạn mãi mãi bên nhau và có một cuộc sống tràn ngập niềm vui và tiếng cười!";
    const ALREADY_BLESSED_MESSAGE = "Đạo hữu đã gửi lời chúc phúc cho cặp đôi này! 🌸";
    const REWARD_RECEIVED_MESSAGE = "Chúc mừng đạo hữu đã nhận được phần thưởng!";

    // Thời gian kiểm tra lặp lại chính
    const MAIN_CHECK_INTERVAL = 2000; // Mỗi 2 giây

    // Thời gian chờ cố định giữa các bước thao tác (điền text, click nút)
    const INTER_ACTION_DELAY = 1000; // 1 giây

    // --- Biến cờ trạng thái ---
    let isBlessingProcessActive = false; // Cờ để đảm bảo quá trình chúc phúc chỉ chạy một lần
    let isLixiProcessActive = false;    // Cờ để đảm bảo quá trình xử lý lì xì chỉ chạy một lần
    let intervalId = null;              // ID của setInterval để có thể dừng nó
    let isScriptStopping = false;       // Cờ để tránh chạy lại logic dừng

    // --- Hàm tiện ích: sleep ---
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Hàm tiện ích: safeClick ---
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            console.error(`[Auto Blessing] LỖI: Không thể click vì ${elementName} là null.`);
            return false;
        }
        if (element.disabled) {
            console.warn(`[Auto Blessing] CẢNH BÁO: ${elementName} bị disabled, không thể click. Phần tử:`, element);
            return false;
        }
        if (element.offsetParent === null) {
            console.warn(`[Auto Blessing] CẢNH BÁO: ${elementName} không hiển thị (offsetParent là null), không thể click. Phần tử:`, element);
            return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.x < 0 || rect.y < 0) {
            console.warn(`[Auto Blessing] CẢNH BÁO: ${elementName} có kích thước 0 hoặc ngoài màn hình, không thể click. Phần tử:`, element);
            return false;
        }

        try {
            console.log(`[Auto Blessing] Đang thử click ${elementName} bằng dispatchEvent.`);
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            console.log(`[Auto Blessing] Đã dispatch MouseEvent 'click' thành công cho ${elementName}.`);
            return true;
        } catch (e) {
            console.warn(`[Auto Blessing] LỖI khi dispatch MouseEvent cho ${elementName}:`, e, "Thử cách click trực tiếp.");
            try {
                element.click();
                console.log(`[Auto Blessing] Đã click trực tiếp ${elementName} thành công.`);
                return true;
            } catch (e2) {
                console.error(`[Auto Blessing] LỖI KHÔNG THỂ CLICK ${elementName} (cả 2 cách):`, e2);
                return false;
            }
        }
    }

    // --- Logic để mở lì xì ---
    async function handleLixi() {
        if (isLixiProcessActive) {
            console.log('[Auto Blessing] handleLixi: Tiến trình xử lý lì xì đã hoặc đang chạy. Bỏ qua.');
            return;
        }
        isLixiProcessActive = true;
        console.log('[Auto Blessing] handleLixi: Bắt đầu xử lý lì xì.');

        // Tìm nút mở lì xì
        const openButton = document.querySelector('#openButton');

        if (openButton && openButton.offsetParent !== null && !openButton.disabled) {
            console.log('[Auto Blessing] handleLixi: Đã tìm thấy nút "Mở Lì Xì". Đang nhấp...');
            if (safeClick(openButton, 'nút "Mở Lì Xì"')) {
                console.log('[Auto Blessing] handleLixi: ĐÃ NHẤP NÚT "Mở Lì Xì" THÀNH CÔNG! Sẽ không tự động đóng lì xì.');
                await sleep(INTER_ACTION_DELAY); // Đợi 1 giây sau khi mở
            } else {
                console.warn('[Auto Blessing] handleLixi: Không thể nhấp nút "Mở Lì Xì". Có thể nút bị disabled hoặc không hiển thị.');
            }
        } else {
            console.log('[Auto Blessing] handleLixi: Nút "Mở Lì Xì" chưa sẵn sàng hoặc không hiển thị.');
        }
        isLixiProcessActive = false; // Đánh dấu là đã xử lý xong (dù thành công hay không)
        console.log('[Auto Blessing] handleLixi: Kết thúc xử lý lì xì.');
    }

    // --- Logic để chúc phúc ---
    async function performBlessing() {
        if (isBlessingProcessActive) {
            console.log('[Auto Blessing] performBlessing: Tiến trình chúc phúc đã hoặc đang chạy. Bỏ qua.');
            return;
        }
        isBlessingProcessActive = true;
        console.log('[Auto Blessing] performBlessing: Bắt đầu quá trình chúc phúc.');

        const textarea = document.querySelector('textarea.blessing-input#blessing-message');
        if (!textarea || textarea.offsetParent === null || textarea.disabled) {
            console.warn('[Auto Blessing] performBlessing: Textarea lời chúc chưa sẵn sàng. Dừng quá trình chúc phúc.');
            isBlessingProcessActive = false;
            return;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy textarea lời chúc. Đang điền lời chúc...');
        textarea.value = WEDDING_BLESSING_MESSAGE;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Auto Blessing] performBlessing: Đã điền lời chúc và kích hoạt sự kiện.');

        await sleep(INTER_ACTION_DELAY);

        const sendButton = document.querySelector('button.blessing-button');
        if (!sendButton || sendButton.offsetParent === null || sendButton.disabled) {
            console.warn('[Auto Blessing] performBlessing: Nút "Gửi Chúc Phúc" chưa sẵn sàng. Dừng quá trình.');
            isBlessingProcessActive = false;
            return;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy nút "Gửi Chúc Phúc".');
        if (!safeClick(sendButton, 'nút "Gửi Chúc Phúc"')) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG thể nhấp nút "Gửi Chúc Phúc". Dừng quá trình.');
            isBlessingProcessActive = false;
            return;
        }
        console.log('[Auto Blessing] performBlessing: ĐÃ NHẤP NÚT "Gửi Chúc Phúc" THÀNH CÔNG!');

        await sleep(INTER_ACTION_DELAY);

        const confirmButton = document.querySelector('button.custom-modal-button.confirm');
        if (!confirmButton || confirmButton.offsetParent === null || confirmButton.disabled) {
            console.warn('[Auto Blessing] performBlessing: Nút "Xác Nhận" chưa sẵn sàng. Dừng quá trình.');
            isBlessingProcessActive = false;
            return;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy nút "Xác Nhận".');
        if (!safeClick(confirmButton, 'nút "Xác Nhận"')) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG thể nhấp nút "Xác Nhận". Dừng quá trình.');
            isBlessingProcessActive = false;
            return;
        }
        console.log('[Auto Blessing] performBlessing: ĐÃ NHẤP NÚT "Xác Nhận" THÀNH CÔNG! Quá trình chúc phúc hoàn tất.');
        isBlessingProcessActive = false; // Đánh dấu là đã xử lý xong
    }

    // --- Hàm dừng script ---
    function stopAutoBlessing() {
        if (isScriptStopping) {
            console.log('[Auto Blessing] Script đang trong quá trình dừng. Bỏ qua.');
            return;
        }
        isScriptStopping = true;
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('%c[Auto Blessing] SCRIPT ĐÃ DỪNG: Đã hoàn thành nhiệm vụ hoặc được dừng thủ công.', 'color: #1a73e8; font-weight: bold;');
        } else {
            console.log('[Auto Blessing] Script không hoạt động (intervalId là null).');
        }
    }

    // --- Hàm kiểm tra chính lặp lại ---
    async function mainLoopCheck() {
        if (isScriptStopping) { // Kiểm tra cờ dừng ngay từ đầu vòng lặp
            // console.log('[Auto Blessing] Main loop check: Script đang dừng. Bỏ qua lần kiểm tra này.'); // Bỏ comment nếu muốn log này
            return;
        }
        console.log(`[Auto Blessing] Main loop check: ${new Date().toLocaleTimeString()} - isBlessingProcessActive: ${isBlessingProcessActive}, isLixiProcessActive: ${isLixiProcessActive}`);

        const blessingMessageDiv = document.querySelector('.blessing-message p'); // Giả định là cùng selector với lời chúc

        // **KIỂM TRA ĐIỀU KIỆN DỪNG SCRIPT ĐẦU TIÊN (Đã nhận thưởng)**
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(REWARD_RECEIVED_MESSAGE)) {
            console.log(`%c[Auto Blessing] ĐÃ PHÁT HIỆN DÒNG CHỮ: "${REWARD_RECEIVED_MESSAGE}". Dừng script.`, 'color: green; font-weight: bold;');
            stopAutoBlessing();
            return; // Dừng ngay lập tức
        }

        // **KIỂM TRA ĐIỀU KIỆN DỪNG SCRIPT THỨ HAI (Đã chúc phúc)**
        let alreadyBlessed = false;
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(ALREADY_BLESSED_MESSAGE)) {
            alreadyBlessed = true;
            console.log(`%c[Auto Blessing] ĐÃ PHÁT HIỆN DÒNG CHỮ: "${ALREADY_BLESSED_MESSAGE}". Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBlessing();
            return; // Dừng ngay lập tức
        }

        // Nếu đã chúc phúc nhưng chưa dừng (ví dụ: cờ isScriptStopping chưa kịp cập nhật)
        // thì không cần thực hiện các bước tiếp theo
        if (alreadyBlessed) {
            console.log('[Auto Blessing] Trạng thái: Đã chúc phúc. Không cần thực hiện thêm hành động chúc phúc.');
            // Vẫn tiếp tục kiểm tra lì xì nếu lì xì có thể xuất hiện sau khi chúc phúc
            // Nếu bạn muốn dừng hoàn toàn script ngay sau khi chúc phúc xong,
            // thì hãy di chuyển stopAutoBlessing() lên đây.
        }


        // Bước 2: Xử lý lì xì nếu có và chưa được xử lý
        const lixiModal = document.querySelector('#liXiModal.active');
        if (lixiModal && lixiModal.offsetParent !== null && !isLixiProcessActive) {
            console.log('[Auto Blessing] Phát hiện modal lì xì đang hoạt động. Bắt đầu xử lý lì xì.');
            await handleLixi();
        }

        // Bước 3: Chúc phúc nếu chưa chúc phúc và chưa có quá trình nào đang chạy
        // Chỉ thực hiện nếu cả lì xì VÀ chúc phúc không đang hoạt động để tránh xung đột
        // Và CHỈ KHI CHƯA CHÚC PHÚC
        if (!alreadyBlessed && !isBlessingProcessActive && !isLixiProcessActive) {
            const textarea = document.querySelector('textarea.blessing-input#blessing-message');
            if (textarea && textarea.offsetParent !== null && !textarea.disabled) {
                console.log('[Auto Blessing] Phát hiện khung nhập lời chúc sẵn sàng. Bắt đầu chúc phúc.');
                await performBlessing();
            } else {
                console.log('[Auto Blessing] Khung nhập lời chúc chưa sẵn sàng.');
            }
        }
    }

    // --- Khởi tạo và chạy vòng lặp chính ---
    function startMainLoop() {
        if (intervalId === null) {
            console.log('[Auto Blessing] Khởi động vòng lặp kiểm tra chính.');
            // Chạy lần kiểm tra đầu tiên ngay lập tức
            mainLoopCheck();
            // Sau đó thiết lập setInterval để lặp lại mỗi 2 giây
            intervalId = setInterval(mainLoopCheck, MAIN_CHECK_INTERVAL);
        } else {
            console.log('[Auto Blessing] Vòng lặp kiểm tra chính đã chạy rồi.');
        }
    }

    // --- Đảm bảo script khởi động một cách mạnh mẽ ---
    // Gọi startMainLoop() ngay lập tức để không bỏ lỡ bất kỳ thời điểm nào.
    startMainLoop();

    // Thêm lắng nghe sự kiện DOMContentLoaded và load để dự phòng
    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Auto Blessing] DOMContentLoaded đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        startMainLoop();
    });

    window.addEventListener('load', () => {
        console.log('[Auto Blessing] window.load đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        startMainLoop();
    });

    // Xuất hàm dừng script ra global scope để có thể gọi từ console
    window.stopAutoBlessing = stopAutoBlessing;

})();
