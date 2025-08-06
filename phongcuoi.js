// ==UserScript==
// @name         HH3D Tiên duyên
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      3.0
// @description  Tự động chúc phúc, nhận lì xì và chặn các phần tử thừa thãi
// @author       Dr. Trune
// @match        https://hoathinh3d.mx/phong-cuoi*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('[HH3D Tối ưu] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Chức năng 1: Chặn các phần tử an toàn (loại trừ phần tử gây lỗi) ---
    // Loại bỏ 'wedding-progress-container' vì nó gây ra lỗi.
    const classesToBlock = [
        'couple-display',
        'recent-blessings',
        'blessings-container',
        'bg-container',
        'bg-overlay',
        'shimmering-overlay',
        'petals-container'
    ];

    const blockingObserver = new MutationObserver((mutationsList, observer) => {
        for (const mutation of mutationsList) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (classesToBlock.some(className => node.classList.contains(className))) {
                        if (node.parentNode) {
                            node.parentNode.removeChild(node);
                            console.log(`[HH3D Tối ưu] Đã chặn phần tử: ${node.classList[0]}`);
                        }
                    }
                }
            }
        }
    });

    blockingObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // --- Chức năng 2: Tự động chúc phúc và nhận lì xì (không thay đổi) ---
    // (Đoạn mã từ script cũ của bạn, không có thay đổi nào cần thiết ở đây)
    const WEDDING_BLESSING_MESSAGE = "Chúc mừng hạnh phúc hai bạn! Chúc hai bạn mãi mãi bên nhau và có một cuộc sống tràn ngập niềm vui và tiếng cười!";
    const ALREADY_BLESSED_MESSAGE = "Đạo hữu đã gửi lời chúc phúc cho cặp đôi này! 🌸";
    const REWARD_RECEIVED_MESSAGE = "Chúc mừng đạo hữu đã nhận được phần thưởng!";
    const LIXI_MODAL_TEXT = "Đạo hữu là vị khách may mắn nhận được lì xì từ chủ tiệc cưới. Hãy mở để xem điều bất ngờ!";
    const MAIN_CHECK_INTERVAL = 1000;
    const LIXI_CHECK_INTERVAL = 1000;
    const LIXI_CHECK_RETRIES = 5;
    const INTER_ACTION_DELAY = 200;

    let isBlessingProcessActive = false;
    let isLixiProcessActive = false;
    let intervalId = null;
    let isScriptStopping = false;
    let hasAttemptedLixiAfterBlessing = false;

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function safeClick(element) {
        if (!element || element.disabled || element.offsetParent === null) return false;
        try {
            element.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            return true;
        } catch (e) {
            try { element.click(); return true; } catch (e2) { return false; }
        }
    }
    async function waitForElementSimple(selector, timeout = 5000, interval = 200) {
        let startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element && element.offsetParent !== null && !element.disabled) return element;
            await sleep(interval);
        }
        return null;
    }
    async function handleLixiWithRetries() {
        if (isLixiProcessActive) return false;
        isLixiProcessActive = true;
        let lixiFoundAndOpened = false;
        for (let i = 0; i < LIXI_CHECK_RETRIES; i++) {
            const lixiMessageP = document.evaluate(`//p[contains(text(), "${LIXI_MODAL_TEXT}")]`, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
            if (lixiMessageP && lixiMessageP.offsetParent !== null) {
                const openButton = await waitForElementSimple('#openButton', INTER_ACTION_DELAY * 2);
                if (openButton && safeClick(openButton)) {
                    await sleep(INTER_ACTION_DELAY);
                    lixiFoundAndOpened = true;
                    stopAutoBlessing();
                    break;
                }
            }
            if (!lixiFoundAndOpened) await sleep(LIXI_CHECK_INTERVAL);
        }
        isLixiProcessActive = false;
        return lixiFoundAndOpened;
    }
    async function performBlessing() {
        if (isBlessingProcessActive) return false;
        isBlessingProcessActive = true;
        const textarea = await waitForElementSimple('textarea.blessing-input#blessing-message', INTER_ACTION_DELAY * 3);
        if (!textarea) { isBlessingProcessActive = false; return false; }
        textarea.value = WEDDING_BLESSING_MESSAGE;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(INTER_ACTION_DELAY);
        const sendButton = await waitForElementSimple('button.blessing-button', INTER_ACTION_DELAY * 3);
        if (!sendButton || !safeClick(sendButton)) { isBlessingProcessActive = false; return false; }
        await sleep(INTER_ACTION_DELAY);
        const confirmButton = await waitForElementSimple('button.custom-modal-button.confirm', INTER_ACTION_DELAY * 3);
        if (!confirmButton || !safeClick(confirmButton)) { isBlessingProcessActive = false; return false; }
        isBlessingProcessActive = false;
        return true;
    }
    function stopAutoBlessing() {
        if (isScriptStopping) return;
        isScriptStopping = true;
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('%c[HH3D Tối ưu] SCRIPT ĐÃ DỪNG: Nhiệm vụ hoàn thành hoặc được dừng thủ công.', 'color: #1a73e8; font-weight: bold;');
        }
    }
    function moveBlessingSection() {
        const blessingSection = document.querySelector('.blessing-section');
        const containerHeader = document.querySelector('.container > header');
        if (blessingSection && containerHeader) {
            containerHeader.parentNode.insertBefore(blessingSection, containerHeader);
            console.log('[HH3D Tối ưu] Đã di chuyển blessing-section lên trên header.');
        }
    }
    async function mainLoopCheck() {
        if (isScriptStopping) return;
        const blessingMessageDiv = document.querySelector('.blessing-message p');
        if (blessingMessageDiv && blessingMessageDiv.textContent.includes(REWARD_RECEIVED_MESSAGE)) {
            console.log(`%c[HH3D Tối ưu] ĐÃ PHÁT HIỆN DÒNG CHỮ: "${REWARD_RECEIVED_MESSAGE}". Dừng script.`, 'color: green; font-weight: bold;');
            stopAutoBlessing();
            return;
        }
        let alreadyBlessed = blessingMessageDiv && blessingMessageDiv.textContent.includes(ALREADY_BLESSED_MESSAGE);
        if (alreadyBlessed) {
            if (!hasAttemptedLixiAfterBlessing) {
                const lixiOpened = await handleLixiWithRetries();
                hasAttemptedLixiAfterBlessing = true;
                if (!lixiOpened) {
                    console.log('%c[HH3D Tối ưu] Đã thử tìm lì xì 5 lần sau chúc phúc nhưng không mở được. Dừng script.', 'color: red; font-weight: bold;');
                    stopAutoBlessing();
                }
            }
        } else if (!isBlessingProcessActive && !isLixiProcessActive) {
            const textarea = document.querySelector('textarea.blessing-input#blessing-message');
            if (textarea && textarea.offsetParent !== null && !textarea.disabled) {
                const blessingSuccess = await performBlessing();
                if (blessingSuccess) {
                    hasAttemptedLixiAfterBlessing = false;
                }
            }
        }
    }
    function startMainLoop() {
        if (intervalId === null) {
            moveBlessingSection();
            mainLoopCheck();
            intervalId = setInterval(mainLoopCheck, MAIN_CHECK_INTERVAL);
        }
    }
    window.addEventListener('DOMContentLoaded', () => { startMainLoop(); });
    window.addEventListener('load', () => { startMainLoop(); });
    window.stopAutoBlessing = stopAutoBlessing;
})();
