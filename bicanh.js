// ==UserScript==
// @name         HH3D Bí Cảnh Tông Môn
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      1.8
// @description  Tự động khiêu chiến và tấn công boss trong Bí Cảnh Tông Môn. Tích hợp UI nút toggle, hiển thị trạng thái, tạm dừng khi hết lượt.
// @author       Dr.Trune
// @match        https://hoathinh3d.gg/bi-canh-tong-mon*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    
    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================

    const INITIAL_SCRIPT_DELAY = 1000;
    const TIMEOUT_ELEMENT_STABLE = 10000;
    const INTERVAL_ELEMENT_STABLE = 500;
    const COOLDOWN_BUFFER_MS = 2000;
    const DELAY_BEFORE_CLICK = 500;
    const DELAY_AFTER_ATTACK = 2000;
    const CHECK_INTERVAL_AFTER_ACTION_MS = 3000;
    const IDLE_CHECK_INTERVAL_MS = 10000;

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const AUTO_CLICK_TOGGLE_KEY = 'hh3dBiCanhAutoClickEnabled';
    let isUIMade = false;
    let isScriptRunning = false;

    let mainLoopTimeoutId = null;
    let scriptStatusElement = null;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function updateScriptStatus(message, type = 'log') {
        if (scriptStatusElement) {
            scriptStatusElement.textContent = `Trạng thái: ${message}`;
            scriptStatusElement.style.color = type === 'error' ? '#ff4d4d' : (type === 'warn' ? '#FFD700' : '#B0C4DE');
        }
        if (type === 'warn') console.warn(`%c[HH3D Bí Cảnh] ${message}`, 'color: yellow;');
        else if (type === 'error') console.error(`%c[HH3D Bí Cảnh] ${message}`, 'color: red;');
        else if (type === 'info') console.info(`%c[HH3D Bí Cảnh] ${message}`, 'color: lightblue;');
        else if (type === 'success') console.log(`%c[HH3D Bí Cảnh] ${message}`, 'color: lightgreen;');
        else console.log(`%c[HH3D Bí Cảnh] ${message}`, 'color: white;');
    }

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let foundElement = null;
        let checkInterval = null;

        const checkElement = () => {
            foundElement = document.querySelector(selector);
            const isVisible = foundElement && foundElement.offsetParent !== null;

            if (isVisible) {
                clearInterval(checkInterval);
                updateScriptStatus(`Đã tìm thấy phần tử "${selector}".`, 'success');
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                clearInterval(checkInterval);
                updateScriptStatus(`Hết thời gian chờ (${timeout}ms) để tìm phần tử "${selector}".`, 'warn');
                callback(null);
            }
        };

        checkInterval = setInterval(checkElement, interval);
        checkElement();
    }

    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            updateScriptStatus(`Lỗi: Không click được ${elementName} (null).`, 'error');
            return false;
        }

        updateScriptStatus(`Đang click ${elementName}...`, 'info');
        try {
            const mouseEvent = new MouseEvent('click', {
                view: window, bubbles: true, cancelable: true
            });
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

    function getCooldownTimeFromButton(buttonElement) {
        if (buttonElement && buttonElement.classList.contains('disabled')) {
            const timeText = buttonElement.textContent.trim();
            const match = timeText.match(/Còn (\d{1,2}):(\d{2})/);
            if (match && match.length === 3) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const totalMs = (minutes * 60 + seconds) * 1000;
                updateScriptStatus(`Nút "Khiêu Chiến" đang hồi chiêu: ${minutes} phút ${seconds} giây.`, 'info');
                return totalMs;
            }
        }
        return 0;
    }

    function getAttackCount() {
        const attackCountSpan = document.querySelector('div.attack-info-display span.attack-count');
        if (attackCountSpan) {
            const count = parseInt(attackCountSpan.textContent.trim(), 10);
            updateScriptStatus(`Đã kiểm tra lượt đánh: ${count}.`, 'info');
            return isNaN(count) ? 0 : count;
        }
        updateScriptStatus('Không tìm thấy phần tử hiển thị lượt đánh. Coi như đã hết lượt.', 'warn');
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
        const state = storedState === null ? true : JSON.parse(storedState);
        updateScriptStatus(`Trạng thái tự động từ bộ nhớ: ${state ? 'BẬT' : 'TẮT'}.`, 'info');
        return state;
    }

    function setAutoClickStateInStorage(enabled) {
        localStorage.setItem(AUTO_CLICK_TOGGLE_KEY, JSON.stringify(enabled));
        updateScriptStatus(`Đã lưu trạng thái tự động: ${enabled ? 'BẬT' : 'TẮT'}.`, 'info');
    }

    function updateToggleSwitchUI(enabled) {
        const toggleSwitch = document.getElementById('autoClickToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
            updateScriptStatus(`Cập nhật nút gạt trên UI: ${enabled ? 'BẬT' : 'TẮT'}.`, 'info');
        }
    }

    function stopMainLoop(reason = 'Tạm dừng vì lỗi nội bộ') {
        if (mainLoopTimeoutId) {
            clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
        }
        isScriptRunning = false;
        updateScriptStatus(`Đã dừng. Lý do: ${reason}`, 'warn');
    }

    function startMainLoopIfEnabled() {
        if (!getAutoClickStateFromStorage()) {
            stopMainLoop('Tính năng tự động đã bị tắt');
            return;
        }
        
        if (isScriptRunning) {
            updateScriptStatus('Vòng lặp đã chạy. Bỏ qua lệnh khởi động.', 'info');
            return;
        }

        isScriptRunning = true;
        updateScriptStatus('Bắt đầu vòng lặp kiểm tra...', 'info');
        checkAndClickBoss();
    }

    // ===============================================
    // HÀM XỬ LÝ GAMEPLAY CHÍNH
    // ===============================================

    async function checkAndClickBoss() {
        updateScriptStatus('--- Bắt đầu chu kỳ kiểm tra mới ---', 'info');
        if (!getAutoClickStateFromStorage() || !isScriptRunning) {
            stopMainLoop('Đã dừng giữa chừng');
            return;
        }

        const currentAttackCount = getAttackCount();
        if (currentAttackCount <= 0) {
            stopMainLoop('Đã hết lượt đánh');
            return;
        }

        const challengeBossBtn = document.querySelector('button#challenge-boss-btn.challenge-btn');

        if (challengeBossBtn) {
            const isButtonDisabled = challengeBossBtn.hasAttribute('disabled');
            const remainingMilliseconds = getCooldownTimeFromButton(challengeBossBtn);

            if (isButtonDisabled && remainingMilliseconds > 0) {
                const delayToNextCheck = remainingMilliseconds + COOLDOWN_BUFFER_MS;
                const nextCheckTime = new Date(Date.now() + delayToNextCheck);
                updateScriptStatus(`Nút Khiêu Chiến đang hồi chiêu. Chờ đến ${formatTimeForDisplay(nextCheckTime.getTime())}.`, 'info');
                mainLoopTimeoutId = setTimeout(checkAndClickBoss, delayToNextCheck);
            } else if (!isButtonDisabled) {
                updateScriptStatus('Nút Khiêu Chiến đã sẵn sàng. Tấn công!', 'success');
                await sleep(DELAY_BEFORE_CLICK);
                if (safeClick(challengeBossBtn, 'nút "Khiêu Chiến"')) {
                    updateScriptStatus('Đã click Khiêu Chiến. Chờ nút "Tấn Công" xuất hiện...', 'info');
                    waitForElementStable('button#attack-boss-btn.attack-button', async (attackBossBtn) => {
                        if (!getAutoClickStateFromStorage() || !isScriptRunning) {
                            stopMainLoop('Đã dừng giữa chừng');
                            return;
                        }
                        if (attackBossBtn) {
                            updateScriptStatus('Nút "Tấn Công" đã xuất hiện.', 'success');
                            await sleep(DELAY_BEFORE_CLICK);
                            if (safeClick(attackBossBtn, 'nút "Tấn Công"')) {
                                updateScriptStatus('Đã click Tấn Công. Chờ trận đánh kết thúc...', 'info');
                                await sleep(DELAY_AFTER_ATTACK);
                                waitForElementStable('button#back-button.back-button', async (backButton) => {
                                    if (!getAutoClickStateFromStorage() || !isScriptRunning) {
                                        stopMainLoop('Đã dừng giữa chừng');
                                        return;
                                    }
                                    if (backButton) {
                                        if (safeClick(backButton, 'nút "Trở lại"')) {
                                            updateScriptStatus('Trận đánh kết thúc. Trở lại menu.', 'success');
                                            const finalAttackCount = getAttackCount();
                                            if (finalAttackCount <= 0) {
                                                stopMainLoop('Đã hết lượt đánh');
                                            } else {
                                                updateScriptStatus('Còn lượt đánh. Chuẩn bị chu kỳ mới sau 3 giây.', 'info');
                                                mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                            }
                                        } else {
                                            updateScriptStatus('Không click được nút Trở lại. Sẽ thử lại.', 'warn');
                                            mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                        }
                                    } else {
                                        updateScriptStatus('Không tìm thấy nút Trở lại. Sẽ thử lại.', 'warn');
                                        mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                    }
                                }, 5000);
                            } else {
                                updateScriptStatus('Không click được nút Tấn Công. Sẽ thử lại.', 'warn');
                                mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                            }
                        } else {
                            updateScriptStatus('Hết thời gian chờ nút Tấn Công. Sẽ thử lại.', 'warn');
                            mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                        }
                    }, 10000);
                } else {
                    updateScriptStatus('Không click được nút Khiêu Chiến. Sẽ thử lại.', 'warn');
                    mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                }
            } else {
                updateScriptStatus('Nút Khiêu Chiến đang ở trạng thái không xác định. Sẽ kiểm tra lại.', 'warn');
                mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
            }
        } else {
            updateScriptStatus('Không tìm thấy nút Khiêu Chiến. Đang chờ.', 'warn');
            mainLoopTimeoutId = setTimeout(checkAndClickBoss, IDLE_CHECK_INTERVAL_MS);
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
            updateToggleSwitchUI(getAutoClickStateFromStorage());
            return;
        }

        console.log('[HH3D Bí Cảnh] Bắt đầu tạo UI.');
        addStyle(`
            #hh3dBiCanhConfig {
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
            #hh3dBiCanhConfig .config-row {
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                justify-content: space-between;
            }
            #hh3dBiCanhConfig label {
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
            #hh3dBiCanhConfig #scriptStatus {
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

        waitForElementStable('div.attack-info-display', (targetDiv) => {
            if (targetDiv && !isUIMade) {
                const configDiv = document.createElement('div');
                configDiv.id = 'hh3dBiCanhConfig';
                configDiv.innerHTML = `
                    <div class="config-row">
                        <label>Tự động tấn công boss:</label>
                        <label class="switch">
                            <input type="checkbox" id="autoClickToggleSwitch">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <span id="scriptStatus">Trạng thái: Đang khởi tạo...</span>
                `;

                targetDiv.parentNode.insertBefore(configDiv, targetDiv);

                scriptStatusElement = configDiv.querySelector('#scriptStatus');
                const toggleSwitch = configDiv.querySelector('#autoClickToggleSwitch');
                updateToggleSwitchUI(getAutoClickStateFromStorage());

                toggleSwitch.addEventListener('change', (event) => {
                    const isChecked = event.target.checked;
                    setAutoClickStateInStorage(isChecked);
                    if (isChecked) {
                        updateScriptStatus('Người dùng đã bật tự động tấn công. Bắt đầu...', 'info');
                        startMainLoopIfEnabled();
                    } else {
                        stopMainLoop('Người dùng đã dừng thủ công');
                    }
                });

                isUIMade = true;
                updateScriptStatus('Giao diện đã sẵn sàng.', 'success');
            } else if (!targetDiv && !isUIMade) {
                console.warn('[HH3D Bí Cảnh] Không tìm thấy div.attack-info-display để chèn UI. UI có thể không hiển thị.');
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // ===============================================
    // KHỞI TẠO SCRIPT & VÒNG LẶP CHÍNH
    // ===============================================

    function initializeScript() {
        console.log('[HH3D Bí Cảnh] Bắt đầu khởi tạo script...');
        createMainUI();

        setTimeout(() => {
            waitForElementStable('#scriptStatus', () => {
                startMainLoopIfEnabled();
            }, TIMEOUT_ELEMENT_STABLE);
        }, INITIAL_SCRIPT_DELAY);
    }

    // --- Entry Point ---
    initializeScript();
})();
