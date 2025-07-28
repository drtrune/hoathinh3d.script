// ==UserScript==
// @name          HH3D Thí Luyện Tông Môn
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       1.5
// @description   Tự động nhận thí luyện
// @author        Dr. Trune
// @match         https://hoathinh3d.gg/thi-luyen-tong-mon*
// @grant         none
// ==/UserScript==

(function() {
    'use strict';

    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================

    const INITIAL_SCRIPT_DELAY = 2000; // 2 giây delay trước khi script bắt đầu chạy
    const TIMEOUT_ELEMENT_STABLE = 3000; // 3 giây
    const INTERVAL_ELEMENT_STABLE = 500; // 0.5 giây

    const COOLDOWN_BUFFER_MS = 2000; // 2 giây đệm thêm sau khi hồi chiêu kết thúc
    const DELAY_BEFORE_CLICK = 1000; // 1 giây độ trễ trước khi thực hiện click
    const CHECK_INTERVAL_AFTER_ACTION_MS = 5000; // Kiểm tra lại mỗi 5 giây sau khi click hoặc nếu không có cooldown/lỗi tìm kiếm element

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const AUTO_CLICK_TOGGLE_KEY = 'hh3dThiLuyenAutoClickEnabled';
    let isAutoClickEnabled = getAutoClickStateFromStorage();
    let isUIMade = false;
    let isScriptFullyInitialized = false;

    let mainLoopTimeoutId = null; // Thay thế mainLoopIntervalId bằng timeout ID

    let scriptStatusElement = null; // Reference to the main script status element

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    function updateScriptStatus(message, type = 'log') {
        if (scriptStatusElement) {
            scriptStatusElement.textContent = `Trạng thái: ${message}`;
            scriptStatusElement.style.color = type === 'error' ? '#ff4d4d' : '#B0C4DE'; // Colors for status element
        }
        // Logs to console (F12)
        if (type === 'warn') console.warn(`[HH3D Thi Luyen] ${message}`);
        else if (type === 'error') console.error(`[HH3D Thi Luyen] ${message}`);
        else if (type === 'info') console.info(`[HH3D Thi Luyen] ${message}`);
        else if (type === 'success') console.log(`%c[HH3D Thi Luyen] ${message}`, 'color: #32CD32;'); // LimeGreen
        else console.log(`[HH3D Thi Luyen] ${message}`);
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
        if (element.offsetParent === null) {
            updateScriptStatus(`${elementName} không hiển thị hoặc không tương tác.`, 'warn');
            return false;
        }

        try {
            updateScriptStatus(`Đang click ${elementName} bằng dispatchEvent.`);
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

    function getCooldownTimeFromElement(cooldownTimerElement) {
        if (cooldownTimerElement && cooldownTimerElement.offsetParent !== null) {
            const timeText = cooldownTimerElement.textContent.trim();
            const parts = timeText.split(':').map(Number);
            let seconds = 0;
            if (parts.length === 3) { // HH:MM:SS
                seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
            } else if (parts.length === 2) { // MM:SS
                seconds = parts[0] * 60 + parts[1];
            } else if (parts.length === 1) { // SS (less common, but for safety)
                seconds = parts[0];
            }
            return seconds * 1000; // Convert to milliseconds
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

    function setAutoClickStateInStorage(enabled) {
        localStorage.setItem(AUTO_CLICK_TOGGLE_KEY, JSON.stringify(enabled));
        isAutoClickEnabled = enabled;
        updateScriptStatus(enabled ? 'Tự động click đã BẬT.' : 'Tự động click đã TẮT.', 'info');

        const toggleSwitch = document.getElementById('autoClickToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }

        if (!enabled) {
            if (mainLoopTimeoutId) clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
            updateScriptStatus('Vòng lặp tự động click đã dừng.', 'info');
        } else if (enabled && !mainLoopTimeoutId) {
            startMainLoop();
        }
    }

    // ===============================================
    // HÀM XỬ LÝ GAMEPLAY CHÍNH
    // ===============================================

    async function checkAndClickChest() {
        if (!isAutoClickEnabled) {
            updateScriptStatus('Tự động click đang TẮT. Bỏ qua.', 'info');
            return;
        }

        const chestImage = document.querySelector('img#chestImage');
        const gameCooldownTimer = document.querySelector('#countdown-timer');

        if (chestImage) {
            const isChestVisible = chestImage.offsetParent !== null;

            if (gameCooldownTimer && gameCooldownTimer.offsetParent !== null) {
                const remainingMilliseconds = getCooldownTimeFromElement(gameCooldownTimer);

                if (remainingMilliseconds > 0) {
                    const delayToNextCheck = remainingMilliseconds + COOLDOWN_BUFFER_MS;
                    const nextClickTimestamp = Date.now() + delayToNextCheck;
                    updateScriptStatus(`Chờ hồi chiêu. Sẽ kiểm tra lại vào ${formatTimeForDisplay(nextClickTimestamp)}.`, 'info');
                    mainLoopTimeoutId = setTimeout(checkAndClickChest, delayToNextCheck);
                } else {
                    updateScriptStatus('Rương đã sẵn sàng, chờ click.', 'info');
                    if (isChestVisible) {
                        await sleep(DELAY_BEFORE_CLICK);
                        if (safeClick(chestImage, 'hình ảnh "Thí Luyện" rương')) {
                            updateScriptStatus('Đã click rương thành công! Đang chờ lượt tiếp theo.', 'success');
                            mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS); // Schedule next check after click
                        } else {
                            updateScriptStatus('Không thể click rương. Sẽ thử lại sau.', 'warn');
                            mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS); // Retry after some time
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
                        updateScriptStatus('Đã click rương thành công! Đang chờ lượt tiếp theo.', 'success');
                        mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS); // Schedule next check after click
                    } else {
                        updateScriptStatus('Không thể click rương. Sẽ thử lại sau.', 'warn');
                        mainLoopTimeoutId = setTimeout(checkAndClickChest, CHECK_INTERVAL_AFTER_ACTION_MS); // Retry after some time
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
            #hh3dThiLuyenConfig #autoClickToggleSwitch {
                width: 20px;
                height: 20px;
                cursor: pointer;
                vertical-align: middle;
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

        // Find the target element to insert the UI below
        waitForElementStable('#countdown-timer', (targetDiv) => {
            if (targetDiv && !isUIMade) {
                const configDiv = document.createElement('div');
                configDiv.id = 'hh3dThiLuyenConfig';
                configDiv.innerHTML = `
                    <div class="config-row">
                        <label for="autoClickToggleSwitch">Tự động click rương:</label>
                        <input type="checkbox" id="autoClickToggleSwitch">
                    </div>
                    <span id="scriptStatus">Trạng thái: Đang khởi tạo...</span>
                `;

                // Insert the new UI div right after the #countdown-timer div
                targetDiv.parentNode.insertBefore(configDiv, targetDiv.nextSibling);

                scriptStatusElement = configDiv.querySelector('#scriptStatus'); // Get reference to the status element
                const toggleSwitch = configDiv.querySelector('#autoClickToggleSwitch');
                toggleSwitch.checked = isAutoClickEnabled;
                toggleSwitch.addEventListener('change', (event) => {
                    setAutoClickStateInStorage(event.target.checked);
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

        // Add initial delay
        await sleep(INITIAL_SCRIPT_DELAY);

        // Create UI first before starting main loop
        createMainUI();

        // Wait for UI elements to be available before setting initial status
        waitForElementStable('#scriptStatus', () => {
            if (isAutoClickEnabled) {
                startMainLoop();
            } else {
                updateScriptStatus('Tự động click đang TẮT. Bật để bắt đầu.', 'info');
            }
        }, 5000); // Give enough time for UI to be rendered
    }

    function startMainLoop() {
        if (mainLoopTimeoutId === null) {
            updateScriptStatus('Bắt đầu vòng lặp kiểm tra chính...', 'info');
            checkAndClickChest();
        } else {
            console.log('[HH3D Thi Luyen] Vòng lặp chính đã chạy.');
        }
    }

    // --- Entry Point ---
    // Use DOMContentLoaded to ensure basic DOM is ready before trying to initialize
    window.addEventListener('DOMContentLoaded', () => {
        initializeScript();
    });

    // Fallback MutationObserver for dynamic content if DOMContentLoaded is too early
    const observer = new MutationObserver((mutations, obs) => {
        // Only try to initialize if script hasn't been fully initialized yet
        if (!isScriptFullyInitialized) {
            // Check for presence of key game elements indicating the page is loaded enough
            if (document.querySelector('img#chestImage') || document.querySelector('#countdown-timer')) {
                initializeScript();
            }
        }
    });

    // Start observing the body for changes
    observer.observe(document.body, { childList: true, subtree: true });

    // Optional: Global function to stop the script manually from console
    window.stopAutoThiLuyenScript = () => {
        if (mainLoopTimeoutId) {
            clearTimeout(mainLoopTimeoutId);
            mainLoopTimeoutId = null;
        }
        updateScriptStatus('Script đã dừng hoàn toàn.', 'info');
        console.log('[HH3D Thi Luyen] Script đã được dừng bởi người dùng.');
    };

})();
