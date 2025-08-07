// ==UserScript==
// @name         HH3D Tiên duyên
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      3.4
// @description  Tự động chúc phúc và nhận lì xì
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/phong-cuoi*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Blessing] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Cấu hình ---
    const WEDDING_BLESSING_MESSAGE = "Chúc mừng hạnh phúc hai bạn! Chúc hai bạn mãi mãi bên nhau và có một cuộc sống tràn ngập niềm vui và tiếng cười!";
    const ALREADY_BLESSED_MESSAGE = "Đạo hữu đã gửi lời chúc phúc cho cặp đôi này! 🌸";
    const REWARD_RECEIVED_MESSAGE = "Chúc mừng đạo hữu đã nhận được phần thưởng!";
    // Dòng chữ để xác định modal lì xì
    const LIXI_MODAL_TEXT = "Đạo hữu là vị khách may mắn nhận được lì xì từ chủ tiệc cưới. Hãy mở để xem điều bất ngờ!";

    // Thời gian kiểm tra lặp lại chính của vòng lặp tổng thể
    const MAIN_CHECK_INTERVAL = 200; // Mỗi 1 giây

    // Cấu hình thời gian chờ và số lần thử cho việc tìm lì xì cụ thể sau khi đã xác định trạng thái chúc phúc
    const LIXI_CHECK_INTERVAL = 1000; // 1 giây
    const LIXI_CHECK_RETRIES =5;     // Tối đa 5 lần (tổng 5 giây chờ lì xì)

    // Thời gian chờ cố định giữa các bước thao tác (điền text, click nút)
    const INTER_ACTION_DELAY = 200; // 0.5 giây

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
            return false;
        }
        isLixiProcessActive = true;
        console.log(`[Auto Blessing] handleLixiWithRetries: Bắt đầu xử lý lì xì (thử ${LIXI_CHECK_RETRIES} lần, mỗi ${LIXI_CHECK_INTERVAL/1000}s).`);

        let lixiFoundAndOpened = false;
        for (let i = 0; i < LIXI_CHECK_RETRIES; i++) {
            // Tìm kiếm phần tử <p> chứa dòng chữ xác nhận lì xì
            const lixiMessageP = document.evaluate(
                `//p[contains(text(), "${LIXI_MODAL_TEXT}")]`,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null
            ).singleNodeValue;

            if (lixiMessageP && lixiMessageP.offsetParent !== null) {
                // Nếu tìm thấy dòng chữ, thử tìm nút mở lì xì
                console.log(`[Auto Blessing] handleLixiWithRetries: Đã tìm thấy dòng chữ lì xì (lần ${i+1}/${LIXI_CHECK_RETRIES})!`);

                const openButton = await waitForElementSimple('#openButton', INTER_ACTION_DELAY * 2, 200, 'nút "Mở Lì Xì"');

                if (openButton) {
                    console.log('[Auto Blessing] handleLixiWithRetries: Đã tìm thấy nút "Mở Lì Xì". Đang nhấp...');
                    if (safeClick(openButton, 'nút "Mở Lì Xì"')) {
                        console.log('%c[Auto Blessing] handleLixiWithRetries: ĐÃ NHẤP NÚT "Mở Lì Xì" THÀNH CÔNG! Sẽ dừng script.', 'color: purple; font-weight: bold;');
                        await sleep(INTER_ACTION_DELAY); // Đợi 1 giây sau khi mở
                        lixiFoundAndOpened = true;
                        // Dừng script ngay sau khi lì xì được mở
                        stopAutoBlessing();
                        break; // Đã mở lì xì, dừng vòng lặp thử
                    } else {
                        console.warn('[Auto Blessing] handleLixiWithRetries: Không thể nhấp nút "Mở Lì Xì". Có thể nút bị disabled hoặc không hiển thị. Thử lại.');
                    }
                } else {
                    console.warn('[Auto Blessing] handleLixiWithRetries: KHÔNG tìm thấy nút "Mở Lì Xì" liên quan đến dòng chữ lì xì. Thử lại.');
                }
            } else {
                console.log(`[Auto Blessing] handleLixiWithRetries: Lần thử ${i+1}/${LIXI_CHECK_RETRIES}: Dòng chữ lì xì chưa sẵn sàng.`);
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
            return false;
        }
        isBlessingProcessActive = true;
        console.log('[Auto Blessing] performBlessing: Bắt đầu quá trình chúc phúc.');

        const textarea = await waitForElementSimple('textarea.blessing-input#blessing-message', INTER_ACTION_DELAY * 3, 200, 'textarea lời chúc');
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

        const sendButton = await waitForElementSimple('button.blessing-button', INTER_ACTION_DELAY * 3, 200, 'nút "Gửi Chúc Phúc"');
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

        const confirmButton = await waitForElementSimple('button.custom-modal-button.confirm', INTER_ACTION_DELAY * 3, 200, 'nút "Xác Nhận"');
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
            console.log('%c[Auto Blessing] SCRIPT ĐÃ DỪNG: Nhiệm vụ hoàn thành hoặc được dừng thủ công.', 'color: #1a73e8; font-weight: bold;');
        } else {
            console.log('[Auto Blessing] Script không hoạt động (intervalId là null).');
        }
    }

    // --- Hàm để di chuyển phần tử blessing-section lên trên container > header ---
    function moveBlessingSection() {
        const blessingSection = document.querySelector('.blessing-section');
        const containerHeader = document.querySelector('.container > header');

        if (blessingSection && containerHeader) {
            containerHeader.parentNode.insertBefore(blessingSection, containerHeader);
            console.log('[Auto Blessing] Đã di chuyển blessing-section lên trên header.');
        } else {
            console.warn('[Auto Blessing] Không tìm thấy một trong các phần tử cần di chuyển: blessing-section hoặc .container > header.');
        }
    }

    // --- Hàm kiểm tra chính lặp lại ---
    async function mainLoopCheck() {
        if (isScriptStopping) {
            return;
        }
        console.log(`[Auto Blessing] Main loop check: ${new Date().toLocaleTimeString()} - BlessingActive: ${isBlessingProcessActive}, LixiActive: ${isLixiProcessActive}, LixiAttempted: ${hasAttemptedLixiAfterBlessing}`);

        const blessingMessageDiv = document.querySelector('.blessing-message p');

        // **KIỂM TRA ĐIỀU KIỆN DỪNG SCRIPT ĐẦU TIÊN (Đã nhận thưởng)**
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(REWARD_RECEIVED_MESSAGE)) {
            console.log(`%c[Auto Blessing] ĐÃ PHÁT HIỆN DÒNG CHỮ: "${REWARD_RECEIVED_MESSAGE}". Dừng script.`, 'color: green; font-weight: bold;');
            stopAutoBlessing();
            return;
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
        // 1. Nếu đã chúc phúc, TẬP TRUNG TÌM LÌ XÌ
        if (alreadyBlessed) {
            if (!hasAttemptedLixiAfterBlessing) {
                console.log('[Auto Blessing] Đã chúc phúc. Bắt đầu tìm lì xì (tối đa 5 lần).');
                const lixiOpened = await handleLixiWithRetries();
                hasAttemptedLixiAfterBlessing = true; // Đánh dấu đã cố gắng tìm lì xì
                if (!lixiOpened) { // Nếu đã cố gắng 5 lần mà không mở được lì xì
                    console.log('%c[Auto Blessing] Đã thử tìm lì xì 5 lần sau chúc phúc nhưng không mở được. Dừng script.', 'color: red; font-weight: bold;');
                    stopAutoBlessing(); // Dừng script vì không mở được lì xì
                }
            } else {
                console.log('[Auto Blessing] Đã chúc phúc và đã cố gắng tìm lì xì. Chờ đợi nếu có thông báo nhận thưởng hoặc dừng thủ công.');
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
            mainLoopCheck();
            intervalId = setInterval(mainLoopCheck, MAIN_CHECK_INTERVAL);
        } else {
            console.log('[Auto Blessing] Vòng lặp kiểm tra chính đã chạy rồi.');
        }
    }

    // --- Đảm bảo script khởi động một cách mạnh mẽ ---
    // Di chuyển phần tử ngay lập tức khi DOM có thể truy cập
    moveBlessingSection();
    startMainLoop();

    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Auto Blessing] DOMContentLoaded đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        moveBlessingSection(); // Đảm bảo di chuyển nếu chưa được thực hiện
        startMainLoop();
    });

    window.addEventListener('load', () => {
        console.log('[Auto Blessing] window.load đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        moveBlessingSection(); // Đảm bảo di chuyển nếu chưa được thực hiện
        startMainLoop();
    });

    // Xuất hàm dừng script ra global scope để có thể gọi từ console
    window.stopAutoBlessing = stopAutoBlessing;

})();