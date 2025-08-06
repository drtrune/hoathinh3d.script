// ==UserScript==
// @name         HH3D Tiên duyên
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      3.2
// @description  Tự động chúc phúc, nhận lì xì
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/phong-cuoi*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';

    console.log('[HH3D Tối ưu] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Cấu hình ---
    const WEDDING_BLESSING_MESSAGE = "Chúc mừng hạnh phúc hai bạn! Chúc hai bạn mãi mãi bên nhau và có một cuộc sống tràn ngập niềm vui và tiếng cười!";
    const ALREADY_BLESSED_MESSAGE = "Đạo hữu đã gửi lời chúc phúc cho cặp đôi này! 🌸";
    const REWARD_RECEIVED_MESSAGE = "Chúc mừng đạo hữu đã nhận được phần thưởng!";
    const LIXI_MODAL_TEXT = "Đạo hữu là vị khách may mắn nhận được lì xì từ chủ tiệc cưới. Hãy mở để xem điều bất ngờ!";
    const BLESSING_MAX_RETRIES = 5; // Số lần thử chúc phúc tối đa
    const LIXI_CHECK_RETRIES = 15; // Số lần thử tìm lì xì tối đa
    const INTER_ACTION_DELAY_MS = 500; // Thời gian chờ giữa các hành động
    const ELEMENT_WAIT_TIMEOUT_MS = 5000; // Thời gian chờ tối đa cho một phần tử
    const RETRY_INTERVAL_MS = 1000; // Thời gian chờ giữa các lần thử lại

    // --- Biến trạng thái ---
    let isScriptRunning = false;

    // --- Các hàm tiện ích ---

    /**
     * Dừng script trong một khoảng thời gian nhất định.
     * @param {number} ms - Thời gian dừng (mili giây).
     * @returns {Promise<void>}
     */
    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    /**
     * Thực hiện click an toàn trên một phần tử, tránh lỗi.
     * @param {HTMLElement} element - Phần tử cần click.
     * @returns {boolean} - Trả về true nếu click thành công, ngược lại false.
     */
    function safeClick(element) {
        if (!element || element.disabled || element.offsetParent === null) {
            return false;
        }
        try {
            element.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            return true;
        } catch (e) {
            console.warn('[HH3D Tối ưu] safeClick dispatchEvent lỗi, thử click() trực tiếp:', e);
            try {
                element.click();
                return true;
            } catch (e2) {
                console.error('[HH3D Tối ưu] safeClick thất bại hoàn toàn:', e2);
                return false;
            }
        }
    }

    /**
     * Chờ một phần tử xuất hiện trên trang.
     * @param {string} selector - CSS selector của phần tử.
     * @param {number} timeout - Thời gian chờ tối đa (mili giây).
     * @returns {Promise<HTMLElement|null>} - Trả về phần tử nếu tìm thấy, ngược lại null.
     */
    async function waitForElement(selector, timeout = ELEMENT_WAIT_TIMEOUT_MS) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null) { // Chỉ cần kiểm tra hiển thị
                return element;
            }
            await sleep(200);
        }
        return null;
    }

    // --- Các hàm logic chính ---

    /**
     * Tìm và mở lì xì với cơ chế thử lại.
     * @returns {Promise<boolean>} - True nếu mở lì xì thành công, ngược lại false.
     */
    async function tryOpenLixi() {
        console.log(`[HH3D Tối ưu] Bắt đầu tìm lì xì, thử tối đa ${LIXI_CHECK_RETRIES} lần.`);
        for (let i = 0; i &lt; LIXI_CHECK_RETRIES; i++) {
            // Dùng XPath để tìm chính xác hơn
            const lixiMessageP = document.evaluate(`//p[contains(text(), "${LIXI_MODAL_TEXT}")]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

            if (lixiMessageP && lixiMessageP.offsetParent !== null) {
                console.log('[HH3D Tối ưu] Đã phát hiện modal lì xì.');
                const openButton = await waitForElement('#openButton');
                if (openButton && safeClick(openButton)) {
                    console.log('%c[HH3D Tối ưu] ĐÃ MỞ LÌ XÌ THÀNH CÔNG!', 'color: #1a73e8; font-weight: bold;');
                    await sleep(INTER_ACTION_DELAY_MS);
                    return true; // Mở thành công
                }
            }
            console.log(`[HH3D Tối ưu] Chưa tìm thấy lì xì, thử lại lần ${i + 1}/${LIXI_CHECK_RETRIES}...`);
            await sleep(RETRY_INTERVAL_MS);
        }
        console.log('[HH3D Tối ưu] Không tìm thấy lì xì sau số lần thử tối đa.');
        return false;
    }

    /**
     * Thực hiện gửi lời chúc phúc.
     * @returns {Promise<boolean>} - True nếu gửi thành công, ngược lại false.
     */
    async function performBlessing() {
        console.log('[HH3D Tối ưu] Đang thực hiện chúc phúc...');
        const textarea = await waitForElement('textarea.blessing-input#blessing-message');
        if (!textarea) {
            console.error('[HH3D Tối ưu] Không tìm thấy ô nhập lời chúc.');
            return false;
        }

        textarea.value = WEDDING_BLESSING_MESSAGE;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(INTER_ACTION_DELAY_MS);

        const sendButton = await waitForElement('button.blessing-button');
        if (!sendButton || !safeClick(sendButton)) {
            console.error('[HH3D Tối ưu] Không thể click nút Gửi lời chúc.');
            return false;
        }
        await sleep(INTER_ACTION_DELAY_MS);

        const confirmButton = await waitForElement('button.custom-modal-button.confirm');
        if (!confirmButton || !safeClick(confirmButton)) {
            console.error('[HH3D Tối ưu] Không thể click nút Xác nhận.');
            return false;
        }

        console.log('%c[HH3D Tối ưu] Gửi lời chúc phúc thành công!', 'color: green; font-weight: bold;');
        return true;
    }

    /**
     * Hàm chính điều khiển toàn bộ luồng tự động.
     */
    async function runAutomation() {
        if (isScriptRunning) return;
        isScriptRunning = true;

        // Di chuyển khu vực chúc phúc lên đầu để dễ quan sát
        const blessingSection = await waitForElement('.blessing-section');
        const containerHeader = await waitForElement('.container > header');
        if (blessingSection && containerHeader) {
            containerHeader.parentNode.insertBefore(blessingSection, containerHeader.nextSibling);
            console.log('[HH3D Tối ưu] Đã di chuyển khu vực chúc phúc.');
        }

        // 1. Kiểm tra xem đã nhận thưởng chưa (trạng thái cuối cùng)
        const blessingMessageDiv = document.querySelector('.blessing-message p');
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(REWARD_RECEIVED_MESSAGE)) {
            console.log(`%c[HH3D Tối ưu] Nhiệm vụ đã hoàn thành trước đó. Script kết thúc.`, 'color: green; font-weight: bold;');
            isScriptRunning = false;
            return;
        }

        // 2. Kiểm tra xem đã chúc phúc chưa
        let isAlreadyBlessed = document.body.textContent.includes(ALREADY_BLESSED_MESSAGE);
        if (!isAlreadyBlessed) {
            console.log('[HH3D Tối ưu] Chưa chúc phúc. Bắt đầu quá trình chúc phúc.');
            for (let i = 0; i < BLESSING_MAX_RETRIES; i++) {
                if (await performBlessing()) {
                    isAlreadyBlessed = true;
                    break;
                }
                console.log(`[HH3D Tối ưu] Chúc phúc thất bại, thử lại lần ${i + 1}/${BLESSING_MAX_RETRIES}...`);
                await sleep(RETRY_INTERVAL_MS);
            }
        } else {
            console.log('[HH3D Tối ưu] Đã chúc phúc từ trước. Chuyển sang tìm lì xì.');
        }

        // 3. Nếu đã chúc phúc, tiến hành tìm lì xì
        if (isAlreadyBlessed) {
            await tryOpenLixi();
        } else {
            console.log('%c[HH3D Tối ưu] Chúc phúc không thành công sau nhiều lần thử. Dừng script.', 'color: orange; font-weight: bold;');
        }

        console.log('%c[HH3D Tối ưu] SCRIPT ĐÃ HOÀN THÀNH LUỒNG CHÍNH.', 'color: #1a73e8; font-weight: bold;');
        isScriptRunning = false;
    }

    // Khởi chạy script khi trang đã tải xong phần nội dung chính
    window.addEventListener('DOMContentLoaded', runAutomation);
})();
