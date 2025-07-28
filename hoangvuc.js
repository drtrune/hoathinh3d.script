// ==UserScript==
// @name         HH3D Hoang vực
// @namespace    http://tampermonkey.net/
// @version      4.6
// @description  Tự động nhận thưởng. Tự động tối ưu ngũ hành và chiến đấu theo chu kỳ.
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/hoang-vuc*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================

    // Thời gian tối đa chờ một phần tử xuất hiện ổn định (ms)
    const TIMEOUT_ELEMENT_STABLE = 2000; // 2 giây
    // Khoảng thời gian giữa các lần kiểm tra phần tử ổn định (ms)
    const INTERVAL_ELEMENT_STABLE = 500; // 0.5 giây

    // Thời gian đệm thêm sau khi hồi chiêu kết thúc (ms)
    const COOLDOWN_BUFFER_MS = 2000; // 2 giây
    // Thời gian tối đa chờ hộp thoại đóng (ms)
    const TIMEOUT_MODAL_CLOSE = 6000; // 6 giây
    // Khoảng thời gian giữa các lần kiểm tra khi chờ hộp thoại đóng (ms)
    const INTERVAL_MODAL_CLOSE = 300; // 0.3 giây

    // Độ trễ trước khi thực hiện click (ms)
    const DELAY_BEFORE_CLICK = 500; // 0.5 giây
    // Độ trễ sau khi thay đổi ngũ hành để game kịp cập nhật (ms)
    const DELAY_AFTER_ELEMENT_CHANGE = 1000; // 1 giây
    // Độ trễ khi script cần thử lại một hành động (ms)
    const DELAY_BETWEEN_RETRIES_SHORT = 500; // 0.5 giây
    const DELAY_BETWEEN_RETRIES_LONG = 1000; // 1 giây

    // Thời gian tối đa chờ nút nhận thưởng khi khởi động (ms)
    const TIMEOUT_REWARD_BUTTON_CHECK_AT_STARTUP = 3000; // 3 giây


    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================

    const LOCAL_STORAGE_KEY = 'hoathinh3d_element_priority';
    let currentPriority = localStorage.getItem(LOCAL_STORAGE_KEY) || 'no-decrease'; // Default to 'no-decrease'
    let isUIMade = false;
    let isScriptFullyInitialized = false; // Flag to ensure initializeScript runs only once

    // Variable to store ID of setTimeout/setInterval for potential clearing
    let currentTimerId = null;
    let cooldownCountdownIntervalId = null; // New variable for cooldown countdown interval

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    // Cập nhật trạng thái hiển thị trên UI
    function updateScriptStatus(message) {
        const statusElement = document.getElementById('scriptStatus');
        if (statusElement) {
            statusElement.textContent = `Trạng thái: ${message}`;
        }
    }

    // Utility function to wait for an element to appear stably in the DOM
    function waitForElementStable(selector, callback, timeout = TIMEOUT_ELEMENT_STABLE, interval = INTERVAL_ELEMENT_STABLE) {
        let startTime = Date.now();
        let foundElement = null;
        let checkCount = 0;

        const intervalId = setInterval(() => {
            foundElement = document.querySelector(selector);
            checkCount++;

            // Check if element is found, is visible (offsetParent not null), and not disabled
            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                clearInterval(intervalId);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                clearInterval(intervalId);
                callback(null); // Call with null to indicate timeout
            }
        }, interval);
    }

    // Safe click function that tries MouseEvent then direct click
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            updateScriptStatus(`Lỗi: Không click được ${elementName}.`);
            return false;
        }
        if (element.disabled) {
            updateScriptStatus(`${elementName} bị khóa.`);
            return false;
        }

        try {
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            updateScriptStatus(`Đã click ${elementName}.`);
            return true;
        } catch (e) {
            try {
                element.click();
                updateScriptStatus(`Đã click ${elementName} (trực tiếp).`);
                return true;
            } catch (e2) {
                updateScriptStatus(`Lỗi nghiêm trọng: Không click được ${elementName}.`);
                return false;
            }
        }
    }

    // Function to get current damage status (decrease, increase, or none)
    function getDamageStatus() {
        const damageInfoElement = document.querySelector('div.damage-info');
        if (damageInfoElement && damageInfoElement.offsetParent !== null) {
            const text = damageInfoElement.textContent.trim();
            if (text.includes('giảm') || text.includes('decrease')) {
                return 'decrease';
            }
            if (text.includes('tăng') || text.includes('increase')) {
                 return 'increase';
            }
        }
        return 'none';
    }

    // Function to parse cooldown time from the timer element
    function getCooldownTimeFromElement(cooldownTimerElement) {
        if (cooldownTimerElement && cooldownTimerElement.offsetParent !== null) {
            const text = cooldownTimerElement.textContent.trim();
            const match = text.match(/Chờ (\d+) phút (\d+) giây/);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const totalMilliseconds = (minutes * 60 + seconds) * 1000;
                return totalMilliseconds;
            }
        }
        return 0;
    }

    // ===============================================
    // HÀM XỬ LÝ GAMEPLAY
    // ===============================================

    // Clicks the reward close button and then waits for the modal to truly disappear
    function clickRewardCloseButtonAndThenWaitForModalToClose(callback) {
        updateScriptStatus('Đang đóng hộp thoại thưởng...');
        // First, explicitly look for the "reward-close" button within the success modal
        waitForElementStable('div.reward-notification.success button.reward-close', (closeButton) => {
            if (closeButton) {
                setTimeout(() => {
                    if (safeClick(closeButton, 'nút "reward-close"')) {
                        waitForModalToClose(callback, 'hộp thoại "Thành công!"');
                    } else {
                        waitForModalToClose(callback, 'hộp thoại "Thành công!" (dự phòng)');
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                waitForModalToClose(callback, 'hộp thoại "Thành công!" (không nút đóng)');
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Waits for a modal (dialog) to close by checking its disappearance
    function waitForModalToClose(callback, modalName = 'hộp thoại') {
        updateScriptStatus(`Đang chờ ${modalName} đóng...`);
        // Use more specific selectors for reward/dialog modals, plus generic ones as fallback
        const modalSelector = 'div.reward-notification.success, div.swal2-container.swal2-center.swal2-backdrop-show, .modal-backdrop, .modal.show';
        let checkAttempts = 0;
        const maxAttempts = TIMEOUT_MODAL_CLOSE / INTERVAL_MODAL_CLOSE; // Check based on configured timeout/interval

        const intervalId = setInterval(() => {
            const modalElement = document.querySelector(modalSelector);
            checkAttempts++;

            if (!modalElement || modalElement.offsetParent === null || modalElement.style.display === 'none') {
                clearInterval(intervalId);
                callback();
            } else if (checkAttempts >= maxAttempts) {
                clearInterval(intervalId);
                callback();
            }
        }, INTERVAL_MODAL_CLOSE);
    }

    // Function to handle element change and confirmation
    function changeElementAndConfirm() {
        updateScriptStatus('Đang thay đổi ngũ hành...');
        waitForElementStable('button#change-element-button.change-element-button', (changeButton) => {
            if (changeButton) {
                setTimeout(() => {
                    if (safeClick(changeButton, 'nút "Thay đổi"')) {
                        waitForElementStable('button.swal2-confirm.swal2-styled', (confirmButton) => {
                            if (confirmButton) {
                                setTimeout(() => {
                                    if (safeClick(confirmButton, 'nút "Đổi" (xác nhận)')) {
                                        setTimeout(() => {
                                            checkRemainingAttacksThenContinue(); // Back to main loop after element change
                                        }, DELAY_AFTER_ELEMENT_CHANGE);
                                    } else {
                                        setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
                                    }
                                }, DELAY_BEFORE_CLICK + 200); // Slightly longer delay for confirm button
                            } else {
                                setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
                            }
                        }, TIMEOUT_ELEMENT_STABLE);
                    } else {
                        setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Initiates battle by clicking "Khiêu chiến"
    function startBattleNow() {
        updateScriptStatus('Đang khiêu chiến...');
        const battleButtonSelector = 'button.battle-button#battle-button';

        waitForElementStable(battleButtonSelector, (battleButton) => {
            if (battleButton) {
                setTimeout(() => {
                    if (safeClick(battleButton, 'nút "Khiêu chiến"')) {
                        clickAttackButton();
                    } else {
                        setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_LONG); // Retry main loop
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_LONG); // Retry main loop
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Clicks the "Tấn Công" button
    function clickAttackButton() {
        updateScriptStatus('Đang tấn công...');
        const attackButtonSelector = 'button.attack-button';

        waitForElementStable(attackButtonSelector, (attackButton) => {
            if (attackButton) {
                setTimeout(() => {
                    if (safeClick(attackButton, 'nút "Tấn Công"')) {
                        // After initiating attack, wait for post-battle state (reward/back button)
                        setTimeout(() => {
                            checkPostBattleState();
                        }, DELAY_AFTER_ELEMENT_CHANGE); // Give a bit of time for battle to conclude or state to change
                    } else {
                        setTimeout(clickAttackButton, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK + 1000); // Slightly longer delay for attack button
            } else {
                setTimeout(clickAttackButton, DELAY_BETWEEN_RETRIES_SHORT);
            }
        }, TIMEOUT_ELEMENT_STABLE + 5000); // More time for attack button as it appears after battle start
    }

    // Checks post-battle state (Reward or Back button)
    function checkPostBattleState() {
        updateScriptStatus('Đang chờ kết quả trận đấu...');

        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                updateScriptStatus('Đã tìm thấy: Nhận thưởng.');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng"')) {
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            checkRemainingAttacksThenContinue(); // Back to main loop after collecting reward
                        });
                    } else {
                        setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                clickBackButton();
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Clicks the "Trở lại" button
    function clickBackButton() {
        updateScriptStatus('Đang đóng hộp thoại...');
        const backButtonSelector = 'button.back-button';

        waitForElementStable(backButtonSelector, (backButton) => {
            if (backButton) {
                setTimeout(() => {
                    if (safeClick(backButton, 'nút "Trở lại"')) {
                        waitForModalToClose(() => {
                            checkRemainingAttacksThenContinue(); // Back to main loop after clicking back
                        }, 'hộp thoại trở lại');
                    } else {
                        setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                setTimeout(checkRemainingAttacksThenContinue, DELAY_BETWEEN_RETRIES_SHORT);
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Checks remaining attacks and decides whether to continue the cycle or stop
    function checkRemainingAttacksThenContinue() {
        updateScriptStatus('Kiểm tra lượt đánh...');
        const remainingAttacksElement = document.querySelector('div.remaining-attacks');
        if (remainingAttacksElement) {
            const attacksText = remainingAttacksElement.textContent;
            const match = attacksText.match(/Lượt đánh còn lại:\s*(\d+)/);
            if (match) {
                const remainingAttacks = parseInt(match[1]);

                if (remainingAttacks <= 0) {
                    updateScriptStatus('HẾT LƯỢT ĐÁNH. Dừng script.');
                    if (currentTimerId) clearTimeout(currentTimerId); // Clear any pending timers
                    if (cooldownCountdownIntervalId) clearInterval(cooldownCountdownIntervalId); // Clear countdown interval
                    return; // Stop script completely
                }
            } else {
                updateScriptStatus(`Không đọc được lượt đánh. Tiếp tục...`);
            }
        } else {
            updateScriptStatus(`Không tìm thấy lượt đánh. Tiếp tục...`);
        }

        // If attacks remain or could not be read, continue with the battle cycle
        startBattleCycle();
    }

    // Main battle loop: checks cooldown, then processes element and battle
    function startBattleCycle() {
        updateScriptStatus('Kiểm tra hồi chiêu...');

        waitForElementStable('#countdown-timer', (cooldownTimerElement) => {
            let cooldownMs = getCooldownTimeFromElement(cooldownTimerElement);
            if (cooldownMs > 0) {
                const endTime = Date.now() + cooldownMs + COOLDOWN_BUFFER_MS;
                
                // Clear any existing countdown interval
                if (cooldownCountdownIntervalId) clearInterval(cooldownCountdownIntervalId);

                // Start updating UI every second
                cooldownCountdownIntervalId = setInterval(() => {
                    const remainingTime = endTime - Date.now();
                    if (remainingTime > 0) {
                        const totalSeconds = Math.ceil(remainingTime / 1000);
                        const minutes = Math.floor(totalSeconds / 60);
                        const seconds = totalSeconds % 60;
                        updateScriptStatus(`Đang chờ hồi chiêu (${minutes}m ${seconds}s)...`);
                    } else {
                        // Cooldown finished, clear interval and proceed
                        clearInterval(cooldownCountdownIntervalId);
                        cooldownCountdownIntervalId = null;
                        checkRemainingAttacksThenContinue(); // Re-enter loop after cooldown
                    }
                }, 1000); // Update every 1 second

                // Set a single timeout for when the cooldown is actually over
                if (currentTimerId) clearTimeout(currentTimerId); // Clear old timer
                currentTimerId = setTimeout(() => {
                    // This timeout will trigger after the countdown interval has already handled the 'remainingTime <= 0' case.
                    // It's a fallback to ensure the main flow continues even if the interval somehow gets stuck.
                    if (cooldownCountdownIntervalId) clearInterval(cooldownCountdownIntervalId);
                    cooldownCountdownIntervalId = null;
                    // `checkRemainingAttacksThenContinue` should be called by the interval's `remainingTime <= 0` logic.
                    // If this timeout triggers, it means the interval logic might not have, so call it here as a safety.
                    if (!document.querySelector('#countdown-timer') || getCooldownTimeFromElement(document.querySelector('#countdown-timer')) === 0) {
                         checkRemainingAttacksThenContinue();
                    }
                }, cooldownMs + COOLDOWN_BUFFER_MS + 2000); // Add a bit more buffer for the final timeout

            } else {
                if (cooldownCountdownIntervalId) clearInterval(cooldownCountdownIntervalId); // Ensure interval is clear
                cooldownCountdownIntervalId = null;
                processElementAndBattle();
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // Processes elemental optimization based on user priority and then starts battle
    function processElementAndBattle() {
        updateScriptStatus('Kiểm tra ngũ hành...');
        const currentDamageStatus = getDamageStatus(); // 'decrease', 'increase', or 'none'

        if (currentPriority === 'no-decrease') {
            if (currentDamageStatus === 'decrease') {
                updateScriptStatus('Sát thương bị GIẢM! Đang tối ưu ngũ hành.');
                changeElementAndConfirm();
            } else {
                updateScriptStatus('Sát thương KHÔNG bị giảm. Bắt đầu chiến đấu.');
                startBattleNow();
            }
        } else if (currentPriority === 'seek-increase') {
            if (currentDamageStatus === 'increase') {
                updateScriptStatus('Sát thương được TĂNG! Bắt đầu chiến đấu.');
                startBattleNow();
            } else {
                updateScriptStatus(`Sát thương KHÔNG tăng. Đang tối ưu ngũ hành.`);
                changeElementAndConfirm();
            }
        }
    }

    // ===============================================
    // GIAO DIỆN NGƯỜI DÙNG (UI)
    // ===============================================

    // Adds CSS styles to the page
    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // Creates the UI for elemental priority selection and script status
    function createUI() {
        if (isUIMade) {
            return;
        }

        addStyle(`
            #autoBattleConfig {
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
                margin-bottom: 5px;
                width: fit-content; /* Allow width to fit content */
                min-width: 180px; /* Minimum width for the container */
                max-width: 350px; /* Increased max width for the container, adjust as needed */
                margin-left: auto;
                margin-right: auto;
            }
            #autoBattleConfig label {
                margin-right: 0px;
                font-weight: bold;
                color: #ADD8E6;
                white-space: nowrap;
            }
            #autoBattleConfig select {
                background: #333;
                color: white;
                border: 1px solid #666;
                border-radius: 4px;
                padding: 3px 5px;
                cursor: pointer;
                width: auto;
                min-width: 150px;
            }
            #autoBattleConfig select:focus {
                outline: none;
                border-color: #7BC0E3;
                box-shadow: 0 0 0 2px rgba(123, 192, 227, 0.3);
            }
            #scriptStatus {
                font-size: 11px;
                color: #B0C4DE; /* Light steel blue */
                margin-top: 3px;
                width: 100%; /* Take full width of parent */
                text-align: center; /* Center the text */
                white-space: normal; /* Allow text to wrap */
                word-wrap: break-word; /* Break long words */
            }
        `);

        // Use waitForElementStable to place the UI correctly
        waitForElementStable('button#change-element-button.change-element-button', (targetButton) => {
            if (targetButton && !isUIMade) {
                const configDiv = document.createElement('div');
                configDiv.id = 'autoBattleConfig';
                configDiv.innerHTML = `
                    <label for="elementPriority">Ưu tiên:</label>
                    <select id="elementPriority">
                        <option value="no-decrease">Không bị giảm sát thương</option>
                        <option value="seek-increase">Tìm tăng sát thương</option>
                    </select>
                    <span id="scriptStatus">Trạng thái: Đang khởi tạo...</span>
                `;
                targetButton.parentNode.insertBefore(configDiv, targetButton);

                const selectElement = configDiv.querySelector('#elementPriority');
                selectElement.value = currentPriority;

                selectElement.addEventListener('change', (event) => {
                    currentPriority = event.target.value;
                    localStorage.setItem(LOCAL_STORAGE_KEY, currentPriority);
                    updateScriptStatus(`Ưu tiên: ${currentPriority === 'no-decrease' ? 'Không giảm' : 'Tìm tăng'}`);
                });

                isUIMade = true;
                updateScriptStatus('Đang khởi động...'); // Initial status
            }
        }, TIMEOUT_ELEMENT_STABLE);
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    // Main initialization function for the script
    function initializeScript() {
        if (isScriptFullyInitialized) {
            return;
        }
        isScriptFullyInitialized = true;

        updateScriptStatus('Đang khởi tạo...');

        // Create UI first
        createUI();

        // Check initial state: Is there a reward to claim? Or is the boss sealed?
        waitForElementStable('button#reward-button.reward-button', (rewardButton) => {
            if (rewardButton) {
                updateScriptStatus('Khởi tạo: Nhận thưởng...');
                setTimeout(() => {
                    if (safeClick(rewardButton, 'nút "Nhận thưởng" khởi động')) {
                        clickRewardCloseButtonAndThenWaitForModalToClose(() => {
                            checkRemainingAttacksThenContinue(); // Start normal cycle
                        });
                    } else {
                        checkRemainingAttacksThenContinue(); // Continue to battle cycle if reward click fails
                    }
                }, DELAY_BEFORE_CLICK);
            } else {
                const bossSealedElement = document.querySelector('div.highlight-text-box');
                if (bossSealedElement && bossSealedElement.textContent.includes('Boss chưa mở Phong Ấn')) {
                    updateScriptStatus('Boss đã chết. Dừng.');
                    // Script naturally stops here if boss is sealed, as no battles can be initiated.
                } else {
                    checkRemainingAttacksThenContinue(); // Start the main battle cycle
                }
            }
        }, TIMEOUT_REWARD_BUTTON_CHECK_AT_STARTUP);
    }

    // --- Entry Point ---
    // Use DOMContentLoaded to ensure basic DOM is ready before trying to initialize
    window.addEventListener('DOMContentLoaded', () => {
        initializeScript();
    });

    // Fallback MutationObserver for dynamic content if DOMContentLoaded is too early
    const uiObserver = new MutationObserver((mutations, obs) => {
        // If UI hasn't been made yet, check for the button to attach UI
        if (!isUIMade) {
            const changeButton = document.querySelector('button#change-element-button.change-element-button');
            if (changeButton) {
                createUI();
            }
        }
        // Also, if the script hasn't fully initialized, try to initialize it once key elements appear
        if (!isScriptFullyInitialized) {
            if (document.querySelector('#countdown-timer') ||
                document.querySelector('div.damage-info') ||
                document.querySelector('button.battle-button#battle-button'))
            {
                initializeScript();
            }
        }
    });

    // Start observing the body for changes
    uiObserver.observe(document.body, { childList: true, subtree: true });

})();
