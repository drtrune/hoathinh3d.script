// ==UserScript==
// @name         HoatHinh3D Chúc phúc & Lì Xì Tự Động (Logic Lì Xì Sau Chúc Phúc)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  Mỗi 2 giây, script sẽ kiểm tra trang để tìm khung nhập lời chúc hoặc modal lì xì. Nếu đã chúc phúc, sẽ tập trung tìm lì xì (5 lần). Tự động dừng script khi phát hiện đã nhận thưởng. KHÔNG TỰ ĐỘNG ĐÓNG LÌ XÌ.
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

    // Thời gian kiểm tra lặp lại chính của vòng lặp tổng thể
    const MAIN_CHECK_INTERVAL = 2000; // Mỗi 2 giây

    // Cấu hình thời gian chờ và số lần thử cho việc tìm lì xì cụ thể sau khi đã xác định trạng thái chúc phúc
    const LIXI_CHECK_INTERVAL = 2000; // 2 giây
    const LIXI_CHECK_RETRIES = 5;     // Tối đa 5 lần (tổng 10 giây chờ lì xì)

    // Thời gian chờ cố định giữa các bước thao tác (điền text, click nút)
    const INTER_ACTION_DELAY = 1000; // 1 giây

    // --- Biến cờ trạng thái ---
    let isBlessingProcessActive = false; // Cờ để đảm bảo quá trình chúc phúc chỉ chạy một lần
    let isLixiProcessActive = false;    // Cờ để đảm bảo quá trình xử lý lì xì chỉ chạy một lần
    let intervalId = null;              // ID của setInterval để có thể dừng nó
    let isScriptStopping = false;       // Cờ để tránh chạy lại logic dừng
    let hasAttemptedLixiAfterBlessing = false; // Cờ để chỉ cố gắng tìm lì xì 5 lần sau khi chúc phúc xong hoặc đã xác định đã chúc phúc

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

    // --- Hàm tiện ích: waitForElementSimple (đơn giản, chỉ chờ mà không retry, dùng nội bộ) ---
    async function waitForElementSimple(selector, timeout = 5000, interval = 200, elementName = selector) {
        let startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null && (!element.disabled || typeof element.disabled === 'undefined')) {
                return element;
            }
            await sleep(interval);
        }
        return null;
    }

    // --- Logic để mở lì xì (với số lần thử giới hạn) ---
    async function handleLixiWithRetries() {
        if (isLixiProcessActive) {
            console.log('[Auto Blessing] handleLixiWithRetries: Tiến trình xử lý lì xì đã hoặc đang chạy. Bỏ qua.');
            return false; // Tránh chạy lại
        }
        isLixiProcessActive = true;
        console.log(`[Auto Blessing] handleLixiWithRetries: Bắt đầu xử lý lì xì (thử ${LIXI_CHECK_RETRIES} lần, mỗi ${LIXI_CHECK_INTERVAL/1000}s).`);

        let lixiFoundAndOpened = false;
        for (let i = 0; i < LIXI_CHECK_RETRIES; i++) {
            const lixiModal = document.querySelector('#liXiModal.active');
            if (lixiModal && lixiModal.offsetParent !== null) {
                console.log(`[Auto Blessing] handleLixiWithRetries: Đã tìm thấy modal lì xì (lần ${i+1}/${LIXI_CHECK_RETRIES})!`);
                const openButton = await waitForElementSimple('#openButton', INTER_ACTION_DELAY * 2, 200, 'nút "Mở Lì Xì"'); // Chờ nút mở 2s
                if (openButton) {
                    console.log('[Auto Blessing] handleLixiWithRetries: Đã tìm thấy nút "Mở Lì Xì". Đang nhấp...');
                    if (safeClick(openButton, 'nút "Mở Lì Xì"')) {
                        console.log('[Auto Blessing] handleLixiWithRetries: ĐÃ NHẤP NÚT "Mở Lì Xì" THÀNH CÔNG! Sẽ không tự động đóng lì xì.');
                        await sleep(INTER_ACTION_DELAY); // Đợi 1 giây sau khi mở
                        lixiFoundAndOpened = true;
                        break; // Đã mở lì xì, dừng vòng lặp thử
                    } else {
                        console.warn('[Auto Blessing] handleLixiWithRetries: Không thể nhấp nút "Mở Lì Xì". Thử lại.');
                    }
                } else {
                    console.warn('[Auto Blessing] handleLixiWithRetries: KHÔNG tìm thấy nút "Mở Lì Xì" trong modal. Thử lại.');
                }
            } else {
                console.log(`[Auto Blessing] handleLixiWithRetries: Lần thử ${i+1}/${LIXI_CHECK_RETRIES}: Modal lì xì chưa sẵn sàng.`);
            }
            if (!lixiFoundAndOpened && i < LIXI_CHECK_RETRIES - 1) { // Chỉ đợi nếu chưa mở được và vẫn còn lần thử
                await sleep(LIXI_CHECK_INTERVAL);
            }
        }
        isLixiProcessActive = false;
        console.log(`[Auto Blessing] handleLixiWithRetries: Kết thúc xử lý lì xì. Lì xì đã mở: ${lixiFoundAndOpened}`);
        return lixiFoundAndOpened;
    }

    // --- Logic để chúc phúc ---
    async function performBlessing() {
        if (isBlessingProcessActive) {
            console.log('[Auto Blessing] performBlessing: Tiến trình chúc phúc đã hoặc đang chạy. Bỏ qua.');
            return false; // Tránh chạy lại
        }
        isBlessingProcessActive = true;
        console.log('[Auto Blessing] performBlessing: Bắt đầu quá trình chúc phúc.');

        const textarea = await waitForElementSimple('textarea.blessing-input#blessing-message', INTER_ACTION_DELAY * 3, 200, 'textarea lời chúc'); // Chờ 3s
        if (!textarea) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG tìm thấy textarea lời chúc sau khi chờ. Dừng quá trình chúc phúc.');
            isBlessingProcessActive = false;
            return false;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy textarea lời chúc. Đang điền lời chúc...');
        textarea.value = WEDDING_BLESSING_MESSAGE;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[Auto Blessing] performBlessing: Đã điền lời chúc và kích hoạt sự kiện.');

        await sleep(INTER_ACTION_DELAY);

        const sendButton = await waitForElementSimple('button.blessing-button', INTER_ACTION_DELAY * 3, 200, 'nút "Gửi Chúc Phúc"'); // Chờ 3s
        if (!sendButton) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG tìm thấy nút "Gửi Chúc Phúc" sau khi chờ. Dừng quá trình.');
            isBlessingProcessActive = false;
            return false;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy nút "Gửi Chúc Phúc".');
        if (!safeClick(sendButton, 'nút "Gửi Chúc Phúc"')) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG thể nhấp nút "Gửi Chúc Phúc". Dừng quá trình.');
            isBlessingProcessActive = false;
            return false;
        }
        console.log('[Auto Blessing] performBlessing: ĐÃ NHẤP NÚT "Gửi Chúc Phúc" THÀNH CÔNG!');

        await sleep(INTER_ACTION_DELAY);

        const confirmButton = await waitForElementSimple('button.custom-modal-button.confirm', INTER_ACTION_DELAY * 3, 200, 'nút "Xác Nhận"'); // Chờ 3s
        if (!confirmButton) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG tìm thấy nút "Xác Nhận" sau khi chờ. Dừng quá trình.');
            isBlessingProcessActive = false;
            return false;
        }
        console.log('[Auto Blessing] performBlessing: Đã tìm thấy nút "Xác Nhận".');
        if (!safeClick(confirmButton, 'nút "Xác Nhận"')) {
            console.warn('[Auto Blessing] performBlessing: KHÔNG thể nhấp nút "Xác Nhận". Dừng quá trình.');
            isBlessingProcessActive = false;
            return false;
        }
        console.log('[Auto Blessing] performBlessing: ĐÃ NHẤP NÚT "Xác Nhận" THÀNH CÔNG! Quá trình chúc phúc hoàn tất.');
        isBlessingProcessActive = false; // Đánh dấu là đã xử lý xong
        return true;
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
            return;
        }
        console.log(`[Auto Blessing] Main loop check: ${new Date().toLocaleTimeString()} - BlessingActive: ${isBlessingProcessActive}, LixiActive: ${isLixiProcessActive}, LixiAttempted: ${hasAttemptedLixiAfterBlessing}`);

        const blessingMessageDiv = document.querySelector('.blessing-message p'); // Giả định là nơi chứa cả lời chúc và thông báo nhận thưởng

        // **KIỂM TRA ĐIỀU KIỆN DỪNG SCRIPT ĐẦU TIÊN (Đã nhận thưởng)**
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(REWARD_RECEIVED_MESSAGE)) {
            console.log(`%c[Auto Blessing] ĐÃ PHÁT HIỆN DÒNG CHỮ: "${REWARD_RECEIVED_MESSAGE}". Dừng script.`, 'color: green; font-weight: bold;');
            stopAutoBlessing();
            return; // Dừng ngay lập tức
        }

        // --- Xác định trạng thái đã chúc phúc ---
        let alreadyBlessed = false;
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(ALREADY_BLESSED_MESSAGE)) {
            alreadyBlessed = true;
            console.log('[Auto Blessing] Trạng thái: Đã chúc phúc.');
        } else {
            console.log('[Auto Blessing] Trạng thái: Chưa chúc phúc.');
        }

        // --- Logic chính ---
        // 1. Nếu đã chúc phúc hoặc quá trình chúc phúc đang diễn ra, TẬP TRUNG TÌM LÌ XÌ
        if (alreadyBlessed) {
            // Chỉ cố gắng tìm lì xì 5 lần sau khi đã chúc phúc
            if (!hasAttemptedLixiAfterBlessing) {
                console.log('[Auto Blessing] Đã chúc phúc. Bắt đầu tìm lì xì (tối đa 5 lần).');
                // Gọi hàm handleLixiWithRetries, và đánh dấu là đã cố gắng
                const lixiOpened = await handleLixiWithRetries();
                hasAttemptedLixiAfterBlessing = true; // Đánh dấu đã cố gắng tìm lì xì sau chúc phúc
                if (lixiOpened) {
                    console.log('[Auto Blessing] Lì xì đã được mở thành công sau chúc phúc. Vẫn tiếp tục vòng lặp để kiểm tra các trường hợp khác (ví dụ: nhận thưởng) hoặc dừng thủ công.');
                    // Nếu bạn muốn dừng script hoàn toàn sau khi lì xì đã được mở, hãy gọi stopAutoBlessing() ở đây
                    // stopAutoBlessing();
                } else {
                    console.log('[Auto Blessing] Đã thử tìm lì xì 5 lần sau chúc phúc nhưng không mở được. Sẽ không thử lại lì xì nữa trong tương lai (trừ khi trang được tải lại).');
                }
            } else {
                console.log('[Auto Blessing] Đã chúc phúc và đã cố gắng tìm lì xì. Chờ đợi nếu có thông báo nhận thưởng.');
            }
        }
        // 2. Nếu chưa chúc phúc VÀ không có quá trình chúc phúc/lì xì nào đang chạy, thì tiến hành chúc phúc
        else if (!isBlessingProcessActive && !isLixiProcessActive) {
            const textarea = document.querySelector('textarea.blessing-input#blessing-message');
            if (textarea && textarea.offsetParent !== null && !textarea.disabled) {
                console.log('[Auto Blessing] Phát hiện khung nhập lời chúc sẵn sàng. Bắt đầu chúc phúc.');
                const blessingSuccess = await performBlessing();
                if (blessingSuccess) {
                    console.log('[Auto Blessing] Chúc phúc thành công! Bây giờ sẽ tìm lì xì.');
                    // Sau khi chúc phúc thành công, chuyển sang trạng thái đã chúc phúc và tìm lì xì
                    hasAttemptedLixiAfterBlessing = false; // Reset cờ để tìm lì xì 5 lần sau khi chúc phúc xong
                    // Vòng lặp tiếp theo sẽ tự động vào nhánh alreadyBlessed và tìm lì xì
                } else {
                    console.warn('[Auto Blessing] Chúc phúc không thành công. Sẽ thử lại ở lần kiểm tra tiếp theo nếu điều kiện cho phép.');
                }
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
