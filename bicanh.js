// ==UserScript==
// @name          HH3D Bí Cảnh Tông Môn
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       1.7
// @description   Tự động khiêu chiến và tấn công boss trong Bí Cảnh Tông Môn. Tích hợp UI nút toggle, hiển thị trạng thái, tạm dừng khi hết lượt, và tự động tiếp tục khi có lượt mới.
// @author        Dr.Trune
// @match         https://hoathinh3d.gg/bi-canh-tong-mon*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================

    const INITIAL_SCRIPT_DELAY = 3000; // 3 giây delay trước khi script bắt đầu chạy
    const TIMEOUT_ELEMENT_STABLE = 5000; // 5 giây chờ element ổn định/xuất hiện
    const INTERVAL_ELEMENT_STABLE = 500; // 0.5 giây kiểm tra element

    const COOLDOWN_BUFFER_MS = 2000; // 2 giây đệm thêm sau khi hồi chiêu kết thúc
    const DELAY_BEFORE_CLICK = 500; // 0.5 giây độ trễ trước khi thực hiện click
    const DELAY_AFTER_ATTACK = 2000; // 2 giây độ trễ sau khi tấn công trước khi click Trở lại
    const CHECK_INTERVAL_AFTER_ACTION_MS = 3000; // Kiểm tra lại mỗi 3 giây sau khi hoàn tất 1 chu trình hoặc không tìm thấy button
    const IDLE_CHECK_INTERVAL_MS = 3600*1000; // 1 giờ: Khoảng thời gian kiểm tra khi script đang "nghỉ" (hết lượt hoặc chờ cooldown)

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const AUTO_CLICK_TOGGLE_KEY = 'hh3dBiCanhAutoClickEnabled';
    let isUIMade = false;
    let isScriptFullyInitialized = false;
    let isScriptRunning = false; // Biến trạng thái để kiểm soát vòng lặp chính
    let lastStopReason = ''; // Biến để lưu lý do dừng gần nhất

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
        if (type === 'warn') console.warn(`[HH3D Bí Cảnh] ${message}`);
        else if (type === 'error') console.error(`[HH3D Bí Cảnh] ${message}`);
        else if (type === 'info') console.info(`[HH3D Bí Cảnh] ${message}`);
        else if (type === 'success') console.log(`%c[HH3D Bí Cảnh] ${message}`, 'color: #32CD32;');
        else console.log(`[HH3D Bí Cảnh] ${message}`);
    }

    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let foundElement = null;

        const checkElement = () => {
            foundElement = document.querySelector(selector);
            const isVisible = foundElement && foundElement.offsetParent !== null;

            if (isVisible) {
                clearInterval(checkInterval);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                clearInterval(checkInterval);
                callback(null);
            }
        };

        const checkInterval = setInterval(checkElement, interval);
        checkElement();
    }

    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            updateScriptStatus(`Lỗi: Không click được ${elementName} (null).`, 'error');
            return false;
        }
        if (element.offsetParent === null && !element.id.includes('button')) {
             updateScriptStatus(`${elementName} không hiển thị hoặc không tương tác.`, 'warn');
             return false;
        }

        try {
            updateScriptStatus(`Đang click ${elementName}...`);
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
            const match = timeText.match(/Còn (\d{1,2}):(\d{2})/); // Matches "Còn X:YY" or "Còn XX:YY"
            if (match && match.length === 3) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                return (minutes * 60 + seconds) * 1000; // Convert to milliseconds
            }
        }
        return 0;
    }

    function getAttackCount() {
        const attackCountSpan = document.querySelector('div.attack-info-display span.attack-count');
        if (attackCountSpan) {
            const count = parseInt(attackCountSpan.textContent.trim(), 10);
            return isNaN(count) ? 0 : count;
        }
        return 0; // Trả về 0 nếu không tìm thấy phần tử, coi như hết lượt
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

    function setAutoClickStateInStorage(enabled) {
        localStorage.setItem(AUTO_CLICK_TOGGLE_KEY, JSON.stringify(enabled));
    }

    function updateToggleSwitchUI(enabled) {
        const toggleSwitch = document.getElementById('autoClickToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }
    }

    function stopMainLoop(reason = 'stopped_internally') {
        if (mainLoopTimeoutId) {
            clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
        }
        isScriptRunning = false;
        lastStopReason = reason; // Lưu lý do dừng
        // Thông báo sẽ được xử lý ở các hàm gọi stopMainLoop, hoặc khi observer kích hoạt
    }

    function startMainLoopIfEnabled() {
        if (!getAutoClickStateFromStorage()) {
            updateScriptStatus('Tự động tấn công đang TẮT. Bật để bắt đầu.', 'info');
            stopMainLoop('disabled_by_user_pref'); // Đảm bảo vòng lặp không chạy nếu trạng thái tắt
            return;
        }

        if (!isScriptRunning) { // Chỉ bắt đầu nếu chưa chạy
            isScriptRunning = true;
            lastStopReason = ''; // Xóa lý do dừng khi bắt đầu lại
            updateScriptStatus('Bắt đầu vòng lặp kiểm tra chính...', 'info');
            checkAndClickBoss();
        } else {
            console.log('[HH3D Bí Cảnh] Vòng lặp chính đã chạy.');
        }
    }

    // ===============================================
    // HÀM XỬ LÝ GAMEPLAY CHÍNH
    // ===============================================

    async function checkAndClickBoss() {
        // Bước 1: Kiểm tra trạng thái tự động click
        if (!getAutoClickStateFromStorage() || !isScriptRunning) {
            // Khi dừng do người dùng tắt preference hoặc isScriptRunning bị false từ đâu đó
            if (lastStopReason === 'disabled_by_user_pref') {
                updateScriptStatus('Tự động tấn công đang TẮT. Bỏ qua.', 'info');
            } else if (lastStopReason === 'stopped_by_user_api') {
                 updateScriptStatus('Script đã dừng bởi người dùng.', 'info');
            } else if (lastStopReason === 'no_attack_count_on_start') {
                // Đã xử lý ở bước 2, không cần thông báo lại ở đây
            } else {
                 // Đây là trường hợp dừng nội bộ không rõ ràng, có thể do isScriptRunning bị false bất ngờ
                 updateScriptStatus('Script không hoạt động. Đã dừng nội bộ.', 'info');
            }
            stopMainLoop('checked_inactive'); // Dừng chính thức nếu chưa dừng
            return;
        }

        // Bước 2: Kiểm tra số lượt đánh còn lại
        const currentAttackCount = getAttackCount();
        if (currentAttackCount <= 0) {
            updateScriptStatus('Đã hết lượt đánh. Tạm dừng tấn công.', 'warn');
            stopMainLoop('no_attack_count'); // Đánh dấu lý do dừng
            return;
        }

        const challengeBossBtn = document.querySelector('button#challenge-boss-btn.challenge-btn');

        if (challengeBossBtn) {
            const isButtonDisabled = challengeBossBtn.hasAttribute('disabled');
            const remainingMilliseconds = getCooldownTimeFromButton(challengeBossBtn);

            if (isButtonDisabled && remainingMilliseconds > 0) {
                const delayToNextCheck = remainingMilliseconds + COOLDOWN_BUFFER_MS;
                const nextCheckTime = new Date(Date.now() + delayToNextCheck);
                updateScriptStatus(`Nút Khiêu Chiến đang hồi chiêu. Sẽ kiểm tra lại vào ${formatTimeForDisplay(nextCheckTime.getTime())}.`, 'info');
                mainLoopTimeoutId = setTimeout(checkAndClickBoss, delayToNextCheck);
            } else if (!isButtonDisabled) {
                updateScriptStatus('Nút Khiêu Chiến đã sẵn sàng. Đang click...', 'info');
                await sleep(DELAY_BEFORE_CLICK);
                if (safeClick(challengeBossBtn, 'nút "Khiêu Chiến"')) {
                    updateScriptStatus('Đã click Khiêu Chiến. Đang chờ nút Tấn Công...', 'info');
                    waitForElementStable('button#attack-boss-btn.attack-button', async (attackBossBtn) => {
                        if (!getAutoClickStateFromStorage() || !isScriptRunning) {
                            updateScriptStatus('Script đã bị dừng trong lúc chờ. Bỏ qua.', 'info');
                            stopMainLoop('stopped_during_wait');
                            return;
                        }
                        if (attackBossBtn) {
                            await sleep(DELAY_BEFORE_CLICK);
                            if (safeClick(attackBossBtn, 'nút "Tấn Công"')) {
                                updateScriptStatus('Đã click Tấn Công. Chờ để trở lại...', 'success');
                                await sleep(DELAY_AFTER_ATTACK);
                                waitForElementStable('button#back-button.back-button', async (backButton) => {
                                    if (!getAutoClickStateFromStorage() || !isScriptRunning) {
                                        updateScriptStatus('Script đã bị dừng trong lúc chờ. Bỏ qua.', 'info');
                                        stopMainLoop('stopped_during_wait');
                                        return;
                                    }
                                    if (backButton) {
                                        if (safeClick(backButton, 'nút "Trở lại"')) {
                                            updateScriptStatus('Đã trở lại. Chu trình hoàn tất. Kiểm tra lại lượt đánh.', 'info');
                                            // Sau khi trở lại, kiểm tra lại lượt đánh ngay lập tức
                                            const finalAttackCount = getAttackCount();
                                            if (finalAttackCount <= 0) {
                                                updateScriptStatus('Đã hết lượt đánh sau khi tấn công. Tạm dừng.', 'warn');
                                                stopMainLoop('no_attack_count_after_last_attack'); // Đánh dấu lý do dừng
                                            } else {
                                                mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                            }
                                        } else {
                                            updateScriptStatus('Không thể click nút Trở lại. Sẽ thử lại vòng lặp chính.', 'warn');
                                            mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                        }
                                    } else {
                                        updateScriptStatus('Không tìm thấy nút Trở lại. Sẽ thử lại vòng lặp chính.', 'warn');
                                        mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                                    }
                                }, 5000);
                            } else {
                                updateScriptStatus('Không thể click nút Tấn Công. Sẽ thử lại vòng lặp chính.', 'warn');
                                mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                            }
                        } else {
                            updateScriptStatus('Không tìm thấy nút Tấn Công trong modal. Sẽ thử lại.', 'warn');
                            mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                        }
                    }, 10000);
                } else {
                    updateScriptStatus('Không thể click nút Khiêu Chiến. Sẽ thử lại sau.', 'warn');
                    mainLoopTimeoutId = setTimeout(checkAndClickBoss, CHECK_INTERVAL_AFTER_ACTION_MS);
                }
            } else {
                updateScriptStatus('Nút Khiêu Chiến đang trong trạng thái không xác định. Sẽ kiểm tra lại.', 'warn');
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
            /* Styles for the toggle switch */
            .switch {
                position: relative;
                display: inline-block;
                width: 38px; /* Adjusted width */
                height: 22px; /* Adjusted height */
            }

            /* Hide default HTML checkbox */
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }

            /* The slider */
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
                border-radius: 22px; /* Makes it round */
            }

            .slider:before {
                position: absolute;
                content: "";
                height: 16px; /* Adjusted height */
                width: 16px; /* Adjusted width */
                left: 3px; /* Adjusted position */
                bottom: 3px; /* Adjusted position */
                background-color: white;
                -webkit-transition: .4s;
                transition: .4s;
                border-radius: 50%; /* Makes the circle */
            }

            input:checked + .slider {
                background-color: #4CAF50; /* Green when checked */
            }

            input:focus + .slider {
                box-shadow: 0 0 1px #4CAF50;
            }

            input:checked + .slider:before {
                -webkit-transform: translateX(16px); /* Adjusted translation */
                -ms-transform: translateX(16px); /* Adjusted translation */
                transform: translateX(16px); /* Adjusted translation */
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
                        startMainLoopIfEnabled();
                    } else {
                        // Khi người dùng tắt thủ công
                        stopMainLoop('user_toggled_off');
                        updateScriptStatus('Script đã dừng thủ công.', 'info');
                    }
                });

                isUIMade = true;
                updateScriptStatus('Giao diện đã sẵn sàng.', 'info');
            } else if (!targetDiv && !isUIMade) {
                console.warn('[HH3D Bí Cảnh] Không tìm thấy div.attack-info-display để chèn UI. UI có thể không hiển thị.');
            }
        }, 10000);
    }

    // ===============================================
    // KHỞI TẠO SCRIPT & VÒNG LẶP CHÍNH
    // ===============================================

    async function initializeScript() {
        if (isScriptFullyInitialized) {
            console.log('[HH3D Bí Cảnh] Script đã được khởi tạo hoàn chỉnh. Bỏ qua.');
            return;
        }
        isScriptFullyInitialized = true;

        updateScriptStatus('Đang khởi tạo script và UI...', 'info');

        await sleep(INITIAL_SCRIPT_DELAY);

        createMainUI();

        waitForElementStable('#scriptStatus', () => {
            startMainLoopIfEnabled(); // Sẽ tự quyết định thông báo dựa trên getAutoClickStateFromStorage()
        }, 5000);
    }

    // --- Entry Point ---
    window.addEventListener('DOMContentLoaded', () => {
        initializeScript();
    });

    const observer = new MutationObserver((mutations, obs) => {
        if (!isScriptFullyInitialized) {
            if (document.querySelector('button#challenge-boss-btn') || document.querySelector('div.attack-info-display')) {
                initializeScript();
                return;
            }
        }

        if (getAutoClickStateFromStorage()) {
            const currentAttackCount = getAttackCount();
            const challengeBossBtn = document.querySelector('button#challenge-boss-btn');

            if (currentAttackCount > 0 && challengeBossBtn && !challengeBossBtn.hasAttribute('disabled')) {
                if (!isScriptRunning) {
                    updateScriptStatus('Phát hiện lượt đánh mới/nút sẵn sàng. Tiếp tục tấn công...', 'info');
                    startMainLoopIfEnabled();
                }
            } else if (currentAttackCount <= 0) {
                if (isScriptRunning) { // Đảm bảo dừng nếu đang chạy và hết lượt
                    stopMainLoop('no_attack_count_observer');
                }
                // Luôn cập nhật trạng thái hết lượt, kể cả khi script đã dừng
                if (scriptStatusElement && (lastStopReason === 'no_attack_count' || lastStopReason === 'no_attack_count_after_last_attack' || lastStopReason === 'no_attack_count_observer')) {
                     updateScriptStatus('Đã hết lượt đánh. Tạm dừng tấn công. Vui lòng nạp thêm lượt.', 'warn');
                } else if (scriptStatusElement && !isScriptRunning && lastStopReason !== 'user_toggled_off' && lastStopReason !== 'stopped_by_user_api') {
                     // Trường hợp hết lượt nhưng chưa có thông báo chính xác, hoặc có lỗi logic nào đó
                     updateScriptStatus('Đã hết lượt đánh. Script tạm dừng chờ lượt mới.', 'warn');
                }
            } else if (challengeBossBtn && challengeBossBtn.hasAttribute('disabled') && getCooldownTimeFromButton(challengeBossBtn) === 0) {
                if (!isScriptRunning) {
                     updateScriptStatus('Nút Khiêu Chiến không xác định trạng thái, thử kiểm tra lại...', 'info');
                     startMainLoopIfEnabled();
                }
            }
        } else {
            // Nếu người dùng đã tắt auto trong localStorage, đảm bảo vòng lặp dừng và UI khớp
            if (isScriptRunning) {
                stopMainLoop('disabled_by_user_pref_observer');
                updateScriptStatus('Tự động tấn công đang TẮT. Bật để bắt đầu.', 'info');
            }
        }
    });

    waitForElementStable('div.attack-info-display', (el) => {
        if (el) {
            observer.observe(el, { childList: true, subtree: true, characterData: true, attributes: true });
            waitForElementStable('button#challenge-boss-btn', (btn) => {
                 if (btn) {
                     observer.observe(btn, { attributes: true, childList: true, subtree: true });
                 }
            }, 5000);
        } else {
            console.warn('[HH3D Bí Cảnh] Không tìm thấy div.attack-info-display để quan sát. Quan sát toàn bộ body.');
            observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
        }
    }, 15000);

    // Hàm public để dừng script thủ công (ví dụ: từ console trình duyệt)
    window.stopAutoBiCanhScript = () => {
        stopMainLoop('stopped_by_user_api');
        setAutoClickStateInStorage(false);
        updateToggleSwitchUI(false);
        updateScriptStatus('Script đã dừng bởi người dùng.', 'info');
        console.log('[HH3D Bí Cảnh] Script đã được dừng bởi người dùng.');
    };

})();
