// ==UserScript==
// @name          HH3D Thí Luyện Tông Môn
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       1.7
// @description   Tự động nhận thí luyện và tự dừng khi hoàn thành
// @author        Dr. Trune
// @match         https://hoathinh3d.mx/thi-luyen-tong-mon*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================

    const INITIAL_SCRIPT_DELAY = 500; // Delay trước khi script bắt đầu chạy
    const TIMEOUT_ELEMENT_STABLE = 2000; // 2 giây
    const INTERVAL_ELEMENT_STABLE = 200; // 0.5 giây

    const COOLDOWN_BUFFER_MS = 2000; // 2 giây đệm thêm sau khi hồi chiêu kết thúc
    const DELAY_BEFORE_CLICK = 200; // delay trước khi thực hiện click
    const CHECK_INTERVAL_AFTER_ACTION_MS = 3000; // Kiểm tra lại mỗi 3 giây sau khi click hoặc nếu không có cooldown/lỗi tìm kiếm element
    const TOAST_CHECK_DELAY = 1000; // Delay sau khi click để kiểm tra thông báo toast

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const AUTO_CLICK_TOGGLE_KEY = 'hh3dThiLuyenAutoClickEnabled';
    let isAutoClickEnabled = getAutoClickStateFromStorage();
    let isUIMade = false;
    let isScriptFullyInitialized = false;

    let mainLoopTimeoutId = null;

    let scriptStatusElement = null;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function updateScriptStatus(message, type = 'log') {
        if (scriptStatusElement) {
            scriptStatusElement.textContent = `Trạng thái: ${message}`;
            scriptStatusElement.style.color = type === 'error' ? '#ff4d4d' : '#B0C4DE';
        }
        const logMessage = `[HH3D Thi Luyen] ${message}`;
        if (type === 'warn') console.warn(logMessage);
        else if (type === 'error') console.error(logMessage);
        else if (type === 'info') console.info(logMessage);
        else if (type === 'success') console.log(`%c${logMessage}`, 'color: #32CD32;');
        else console.log(logMessage);
    }

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let foundElement = null;
        const checkInterval = setInterval(() => {
            foundElement = document.querySelector(selector);
            const isVisible = foundElement && foundElement.offsetParent !== null;
            if (isVisible) {
                clearInterval(checkInterval);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                clearInterval(checkInterval);
                callback(null);
            }
        }, interval);
        const initialElement = document.querySelector(selector);
        if (initialElement && initialElement.offsetParent !== null) {
            clearInterval(checkInterval);
            callback(initialElement);
        }
    }

    function safeClick(element, elementName = 'phần tử') {
        if (!element || element.offsetParent === null) {
            updateScriptStatus(`Lỗi: Không thể click ${elementName} (phần tử không tồn tại hoặc không hiển thị).`, 'error');
            return false;
        }
        try {
            updateScriptStatus(`Đang click ${elementName} bằng dispatchEvent.`);
            const mouseEvent = new MouseEvent('click', { view: window, bubbles: true, cancelable: true });
            element.dispatchEvent(mouseEvent);
            updateScriptStatus(`Đã click ${elementName} thành công!`, 'success');
            return true;
        } catch (e) {
            updateScriptStatus(`Lỗi khi dispatch MouseEvent cho ${elementName}: ${e.message}. Đang thử click trực tiếp.`, 'warn');
            try {
                element.click();
                updateScriptStatus(`Đã click ${elementName} trực tiếp thành công!`, 'success');
                return true;
            } catch (e2) {
                updateScriptStatus(`Lỗi nghiêm trọng: Không click được ${elementName} (cả hai phương pháp): ${e2.message}.`, 'error');
                return false;
            }
        }
    }

    function getCooldownTimeFromElement(cooldownTimerElement) {
        if (cooldownTimerElement && cooldownTimerElement.offsetParent !== null) {
            const timeText = cooldownTimerElement.textContent.trim();
            const parts = timeText.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 3) {
                seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) {
                seconds = parts[0] * 60 + parts[1];
            } else if (parts.length === 1) {
                seconds = parts[0];
            }
            return seconds * 1000;
        }
        return 0;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatTimeForDisplay(timestamp) {
        const date = new Date(timestamp);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    // ===============================================
    // QUẢN LÝ TRẠNG THÁI TỰ ĐỘNG CLICK
    // ===============================================

    function getAutoClickStateFromStorage() {
        const storedState = localStorage.getItem(AUTO_CLICK_TOGGLE_KEY);
        return storedState === null ? true : JSON.parse(storedState);
    }

    function setAutoClickState(enabled, saveToStorage = false) {
        isAutoClickEnabled = enabled;
        if (saveToStorage) {
            localStorage.setItem(AUTO_CLICK_TOGGLE_KEY, JSON.stringify(enabled));
        }

        updateScriptStatus(enabled ? 'Tự động thí luyện đã BẬT.' : 'Tự động thí luyện đã TẮT.', 'info');
        const toggleSwitch = document.getElementById('autoClickToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }

        if (!enabled) {
            if (mainLoopTimeoutId) clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
            updateScriptStatus('Vòng lặp tự động đã dừng.', 'info');
        } else if (enabled && !mainLoopTimeoutId) {
            startMainLoop();
        }
    }

    // ===============================================
    // HÀM XỬ LÝ CHÍNH
    // ===============================================

    async function checkCompletionAndStop() {
        updateScriptStatus(`Đang kiểm tra thông báo hoàn thành nhiệm vụ...`, 'info');
        await sleep(TOAST_CHECK_DELAY);

        const completionToast = document.querySelector('.toast.error span');
        if (completionToast && completionToast.textContent.includes('Đã hoàn thành Thí Luyện Tông Môn hôm nay')) {
            updateScriptStatus('Phát hiện thông báo hoàn thành nhiệm vụ. Dừng script.', 'success');

            // Dừng vòng lặp nhưng không thay đổi giá trị trong localStorage
            if (mainLoopTimeoutId) {
                clearTimeout(mainLoopTimeoutId);
                mainLoopTimeoutId = null;
            }
            return true;
        }
        return false;
    }

    async function checkAndClickChest() {
        if (!isAutoClickEnabled) {
            updateScriptStatus('Tự động thí luyện đang TẮT. Bỏ qua.', 'info');
            return;
        }

        const chestImage = document.querySelector('img#chestImage');
        const gameCooldownTimer = document.querySelector('#countdown-timer');

        // Kiểm tra ngay xem nhiệm vụ đã xong chưa trước khi thực hiện bất kỳ hành động nào
        if (await checkCompletionAndStop()) {
             return;
        }

        if (chestImage) {
            const isChestVisible = chestImage.offsetParent !== null;
            if (gameCooldownTimer && gameCooldownTimer.offsetParent !== null) {
                const remainingMilliseconds = getCooldownTimeFromElement(gameCooldownTimer);
                if (remainingMilliseconds > 0) {
                    const delayToNextCheck = remainingMilliseconds + COOLDOWN_BUFFER_MS;
                    const nextClickTimestamp = Date.now() + delayToNextCheck;
                    updateScriptStatus(`Đang chờ hồi chiêu. Sẽ kiểm tra lại vào ${formatTimeForDisplay(nextClickTimestamp)}.`, 'info');
                    mainLoopTimeoutId = setTimeout(checkAndClickChest, delayToNextCheck);
                } else {
                    updateScriptStatus('Rương đã sẵn sàng, chờ click.', 'info');
                    if (isChestVisible) {
                        await sleep(DELAY_BEFORE_CLICK);
                        if (safeClick(chestImage, 'hình ảnh "Thí Luyện" rương')) {
                            updateScriptStatus('Đã click rương thành công! Đang kiểm tra trạng thái hoàn thành...', 'success');
                            if (await checkCompletionAndStop()) {
                                return;
                            }
                            mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                        } else {
                            updateScriptStatus('Không thể click rương. Sẽ thử lại sau.', 'warn');
                            mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                        }
                    } else {
                        updateScriptStatus('Rương chưa hiển thị, đang chờ.', 'info');
                        mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                    }
                }
            } else {
                updateScriptStatus('Không tìm thấy bộ đếm hồi chiêu. Đang kiểm tra rương.', 'info');
                if (isChestVisible) {
                    await sleep(DELAY_BEFORE_CLICK);
                    if (safeClick(chestImage, 'hình ảnh "Thí Luyện" rương')) {
                        updateScriptStatus('Đã click rương thành công! Đang kiểm tra trạng thái hoàn thành...', 'success');
                        if (await checkCompletionAndStop()) {
                             return;
                        }
                        mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                    } else {
                        updateScriptStatus('Không thể click rương. Sẽ thử lại sau.', 'warn');
                        mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                    }
                } else {
                    updateScriptStatus('Rương chưa hiển thị, đang chờ.', 'info');
                    mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
                }
            }
        } else {
            updateScriptStatus('Không tìm thấy hình ảnh rương "Thí Luyện". Đang chờ.', 'warn');
            mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS);
        }
    }

    // ===============================================
    // GIAO DIỆN NGƯỜI DÙNG (UI)
    // ===============================================

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function createMainUI() {
        if (isUIMade) {
            const toggleSwitch = document.getElementById('autoClickToggleSwitch');
            if (toggleSwitch) {
                toggleSwitch.checked = isAutoClickEnabled;
            }
            return;
        }

        addStyle(`
            #hh3dThiLuyenConfig {
                background: rgba(40, 44, 52, 0.9);
                color: white;
                padding: 5px 10px;
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 12px;
                z-index: 9999;
                border: 1px solid #555;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                margin-top: 10px;
                margin-left: auto;
                margin-right: auto;
                width: fit-content;
                min-width: 180px;
                max-width: 350px;
            }
            #hh3dThiLuyenConfig .config-row {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                justify-content: space-between;
            }
            #hh3dThiLuyenConfig label {
                font-weight: bold;
                color: #ADD8E6;
                white-space: nowrap;
            }
            .switch {
                position: relative;
                display: inline-block;
                width: 38px;
                height: 22px;
            }
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #ccc;
                -webkit-transition: .4s;
                transition: .4s;
                border-radius: 22px;
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                -webkit-transition: .4s;
                transition: .4s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: #4CAF50;
            }
            input:focus + .slider {
                box-shadow: 0 0 1px #4CAF50;
            }
            input:checked + .slider:before {
                -webkit-transform: translateX(16px);
                -ms-transform: translateX(16px);
                transform: translateX(16px);
            }
            #hh3dThiLuyenConfig #scriptStatus {
                font-size: 11px;
                color: #B0C4DE;
                margin-top: 3px;
                width: 100%;
                text-align: center;
                white-space: normal;
                word-wrap: break-word;
                line-height: 1.4;
            }
        `);
        waitForElementStable('#countdown-timer', (targetDiv) => {
            if (targetDiv && !isUIMade) {
                const configDiv = document.createElement('div');
                configDiv.id = 'hh3dThiLuyenConfig';
                configDiv.innerHTML = `
                    <div class="config-row">
                        <label>Tự động thí luyện</label>
                        <label class="switch">
                            <input type="checkbox" id="autoClickToggleSwitch">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <span id="scriptStatus">Trạng thái: Đang khởi tạo...</span>
                `;
                targetDiv.parentNode.insertBefore(configDiv, targetDiv.nextSibling);
                scriptStatusElement = configDiv.querySelector('#scriptStatus');
                const toggleSwitch = configDiv.querySelector('#autoClickToggleSwitch');
                toggleSwitch.checked = isAutoClickEnabled;
                toggleSwitch.addEventListener('change', (event) => {
                    setAutoClickState(event.target.checked, true);
                });
                isUIMade = true;
                updateScriptStatus('Giao diện đã sẵn sàng.', 'info');
            }
        });
    }

    // ===============================================
    // KHỞI TẠO SCRIPT & VÒNG LẶP CHÍNH
    // ===============================================

    async function initializeScript() {
        if (isScriptFullyInitialized) {
            console.log('[HH3D Thi Luyen] Script đã được khởi tạo hoàn chỉnh. Bỏ qua.');
            return;
        }
        isScriptFullyInitialized = true;
        updateScriptStatus('Đang khởi tạo script và UI...', 'info');
        await sleep(INITIAL_SCRIPT_DELAY);
        createMainUI();
        waitForElementStable('#scriptStatus', () => {
            if (isAutoClickEnabled) {
                startMainLoop();
            } else {
                updateScriptStatus('Tự động thí luyện đang TẮT. Bật để bắt đầu.', 'info');
            }
        }, 5000);
    }

    function startMainLoop() {
        if (mainLoopTimeoutId === null) {
            updateScriptStatus('Bắt đầu vòng lặp kiểm tra chính...', 'info');
            checkAndClickChest();
        } else {
            console.log('[HH3D Thi Luyen] Vòng lặp chính đã chạy.');
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        initializeScript();
    });

    const observer = new MutationObserver((mutations, obs) => {
        if (!isScriptFullyInitialized) {
            if (document.querySelector('img#chestImage') || document.querySelector('#countdown-timer')) {
                initializeScript();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.stopAutoThiLuyenScript = () => {
        if (mainLoopTimeoutId) {
            clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
        }
        updateScriptStatus('Script đã dừng hoàn toàn.', 'info');
        console.log('[HH3D Thi Luyen] Script đã được dừng bởi người dùng.');
    };

})();
