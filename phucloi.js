// ==UserScript==
// @name        HH3D Phúc lợi
// @namespace   https://github.com/drtrune/hoathinh3d.script
// @version     1.1
// @description Tự động hóa mở rương phúc lợi và nhận thưởng cột mốc
// @author      Dr.Trune
// @match       https://hoathinh3d.mx/phuc-loi-duong*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    // ===============================================
    // CẤU HÌNH CÁC BIẾN THỜI GIAN
    // ===============================================
    const COOLDOWN_BUFFER_MS = 2000;   // Thêm 2 giây đệm cho an toàn sau hồi chiêu rương
    const DELAY_BEFORE_CLICK = 500;     // Độ trễ trước khi click (giữa các hành động click)
    const CHECK_INTERVAL_MS = 1000;     // Khoảng thời gian kiểm tra lại chung

    // ===============================================
    // CẤU HÌNH BAN ĐẦU VÀ BIẾN TOÀN CỤC
    // ===============================================
    const LOCAL_STORAGE_KEY_TOGGLE = 'autoOpenChest_enabled';
    // Mặc định là true nếu chưa từng lưu trong localStorage
    let isAutoRunOnLoadEnabled = localStorage.getItem(LOCAL_STORAGE_KEY_TOGGLE) === null ? true : localStorage.getItem(LOCAL_STORAGE_KEY_TOGGLE) === 'true';
    let isScriptRunning = isAutoRunOnLoadEnabled;

    let currentTimerId = null;
    let uiCreated = false;

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================

    /**
     * Cập nhật trạng thái hiển thị trên giao diện người dùng (UI).
     * @param {string} message - Thông điệp trạng thái cần hiển thị.
     */
    function updateScriptStatus(message) {
        const statusElement = document.getElementById('chestScriptStatus');
        if (statusElement) {
            statusElement.textContent = `Trạng thái: ${message}`;
        }
    }

    /**
     * Hàm an toàn để click vào một phần tử HTML.
     * @param {HTMLElement} element - Phần tử cần click.
     * @param {string} elementName - Tên mô tả của phần tử để hiển thị trong UI status.
     * @returns {boolean} True nếu click thành công, False nếu không.
     */
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            updateScriptStatus(`Lỗi: Không tìm thấy ${elementName} để click.`);
            return false;
        }
        if (element.disabled) {
            updateScriptStatus(`${elementName} bị khóa, không thể click.`);
            return false;
        }

        try {
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            return true;
        } catch (e) {
            try {
                element.click();
                return true;
            } catch (e2) {
                updateScriptStatus(`Lỗi nghiêm trọng: Không click được ${elementName}.`);
                return false;
            }
        }
    }

    /**
     * Lấy thời gian hồi chiêu từ phần tử countdown-timer.
     * @returns {number} Thời gian hồi chiêu tính bằng mili giây, 0 nếu không đọc được.
     */
    function getCooldownTimeFromElement() {
        const cooldownTimerElement = document.getElementById('countdown-timer');
        if (cooldownTimerElement && cooldownTimerElement.offsetParent !== null) {
            const text = cooldownTimerElement.textContent.trim();
            const parts = text.split(':');
            if (parts.length === 2) {
                const minutes = parseInt(parts[0]);
                const seconds = parseInt(parts[1]);
                if (!isNaN(minutes) && !isNaN(seconds)) {
                    const totalMilliseconds = (minutes * 60 + seconds) * 1000;
                    return totalMilliseconds;
                }
            }
        }
        return 0;
    }


    // ===============================================
    // HÀM XỬ LÝ CHỨC NĂNG CHÍNH
    // ===============================================

    /**
     * Dừng hoạt động của script trong phiên hiện tại.
     * Không ảnh hưởng đến cài đặt UI hoặc Local Storage.
     * @param {string} reason - Lý do dừng script.
     */
    function stopCurrentScriptRun(reason = 'Hoàn tất') {
        if (currentTimerId) {
            clearTimeout(currentTimerId);
            currentTimerId = null;
        }
        isScriptRunning = false;
        updateScriptStatus(`Dừng hoạt động: ${reason}.`);
    }

    /**
     * Logic chính để kiểm tra và mở rương hàng ngày.
     */
    function checkAndOpenChest() {
        if (!isScriptRunning) {
            updateScriptStatus('Tính năng tự động mở rương đang TẮT. Dừng.');
            return;
        }

        updateScriptStatus('Đang kiểm tra rương hàng ngày...');
        const chestContainers = document.querySelector('.chest-progress-container');
        if (!chestContainers) {
            updateScriptStatus('Không tìm thấy vùng chứa rương. Thử lại sau.');
            currentTimerId = setTimeout(checkAndOpenChest, CHECK_INTERVAL_MS * 5);
            return;
        }

        const allChests = Array.from(chestContainers.children);
        let foundChestToOpen = null;
        let allOpened = true;

        for (const chest of allChests) {
            const isOpened = chest.classList.contains('opened');
            const isShake = chest.classList.contains('shake');

            if (isShake) {
                foundChestToOpen = chest;
                allOpened = false;
                break;
            }

            if (!isOpened && !isShake) {
                // Rương chưa mở và chưa sẵn sàng mở
                allOpened = false;
            }
        }

        if (allOpened) {
            updateScriptStatus('Tất cả rương phúc lợi đã mở. Chuyển sang nhận thưởng cột mốc.');
            if (currentTimerId) clearTimeout(currentTimerId);
            collectMilestoneRewards();
            return;
        }

        if (foundChestToOpen) {
            const cooldownMs = getCooldownTimeFromElement();
            const chestLabelElement = foundChestToOpen.querySelector('p.chest-label');
            const chestName = chestLabelElement ? chestLabelElement.textContent : `Rương ${foundChestToOpen.dataset.id}`;

            if (cooldownMs > 0) {
                const totalWaitTime = cooldownMs + COOLDOWN_BUFFER_MS;
                const nextOpenTime = new Date(Date.now() + totalWaitTime);
                const h = String(nextOpenTime.getHours()).padStart(2, '0');
                const m = String(nextOpenTime.getMinutes()).padStart(2, '0');
                const s = String(nextOpenTime.getSeconds()).padStart(2, '0');
                updateScriptStatus(`Rương ${chestName} đang hồi chiêu. Sẽ mở lúc ${h}:${m}:${s}`);

                if (currentTimerId) clearTimeout(currentTimerId);
                currentTimerId = setTimeout(() => {
                    checkAndOpenChest();
                }, totalWaitTime);
            } else {
                updateScriptStatus(`Rương ${chestName} sẵn sàng mở.`);

                if (currentTimerId) clearTimeout(currentTimerId);
                currentTimerId = setTimeout(() => {
                    if (safeClick(foundChestToOpen, `Rương ${foundChestToOpen.dataset.id}`)) {
                        // Không cần chờ hộp thoại
                        currentTimerId = setTimeout(checkAndOpenChest, DELAY_BEFORE_CLICK + 1000);
                    } else {
                        currentTimerId = setTimeout(checkAndOpenChest, CHECK_INTERVAL_MS * 2);
                    }
                }, DELAY_BEFORE_CLICK);
            }
        } else {
            updateScriptStatus('Không tìm thấy rương cần mở. Đang chờ để kiểm tra lại...');
            if (currentTimerId) clearTimeout(currentTimerId);
            currentTimerId = setTimeout(checkAndOpenChest, CHECK_INTERVAL_MS * 5);
        }
    }

    /**
     * Thu thập tất cả các phần thưởng cột mốc khả dụng.
     */
    async function collectMilestoneRewards() {
        updateScriptStatus('Đang kiểm tra và nhận thưởng cột mốc...');

        if (!isScriptRunning) {
            updateScriptStatus('Tính năng tự động mở rương đang TẮT. Dừng.');
            return;
        }

        const milestoneContainer = document.querySelector('.reward-progress-container');
        if (!milestoneContainer) {
            updateScriptStatus('Không tìm thấy vùng chứa cột mốc. Dừng nhận thưởng cột mốc.');
            stopCurrentScriptRun('Không tìm thấy cột mốc');
            return;
        }

        const milestones = Array.from(milestoneContainer.querySelectorAll('.milestone'));
        let collectedAnyReward = false;

        for (const milestone of milestones) {
            const giftBox = milestone.querySelector('.gift-box');
            const milestoneTextElement = milestone.querySelector('.milestone-text');
            const milestoneValue = milestoneTextElement ? milestoneTextElement.textContent.trim() : `Cột mốc ${milestone.dataset.id || 'N/A'}`;

            if (giftBox && giftBox.classList.contains('active') && giftBox.src.includes('ruong-thuong-close.png')) {
                updateScriptStatus(`Đang nhận thưởng cột mốc: ${milestoneValue}`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BEFORE_CLICK)); // Vẫn giữ độ trễ giữa các lần click

                if (safeClick(giftBox, `Phần thưởng cột mốc ${milestoneValue}`)) {
                    collectedAnyReward = true;
                }
            }
        }

        if (collectedAnyReward) {
            updateScriptStatus('Đã hoàn tất nhận thưởng cột mốc. Hoạt động đã dừng.');
        } else {
            updateScriptStatus('Không có phần thưởng cột mốc nào để nhận. Hoạt động đã dừng.');
        }
        stopCurrentScriptRun('Đã mở tất cả phần thưởng');
    }

    // ===============================================
    // GIAO DIỆN NGƯỜI DÙNG (UI)
    // ===============================================

    /**
     * Chèn CSS styles vào trang.
     * @param {string} css - Chuỗi CSS cần thêm.
     */
    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    /**
     * Tạo và chèn giao diện người dùng cho script.
     * Đảm bảo chỉ tạo một lần.
     */
    function createUI() {
        if (uiCreated) {
            return;
        }

        addStyle(`
            #autoChestConfig {
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
                width: fit-content;
                min-width: 180px;
                max-width: 350px;
                margin-left: auto;
                margin-right: auto;
                pointer-events: all !important;
            }
            #autoChestConfig .config-row {
                display: flex;
                align-items: center;
                gap: 5px;
                pointer-events: all !important;
            }
            #autoChestConfig label {
                font-weight: bold;
                color: #ADD8E6;
                white-space: nowrap;
                cursor: pointer;
                pointer-events: all !important;
            }
            #autoChestConfig input[type="checkbox"] {
                width: 16px;
                height: 16px;
                cursor: pointer;
                pointer-events: all !important;
            }
            #chestScriptStatus {
                font-size: 11px;
                color: #B0C4DE;
                margin-top: 3px;
                width: 100%;
                text-align: center;
                white-space: normal;
                word-wrap: break-word;
                pointer-events: all !important;
            }
        `);

        const countdownTimer = document.getElementById('countdown-timer');
        if (countdownTimer) {
            const configDiv = document.createElement('div');
            configDiv.id = 'autoChestConfig';
            configDiv.innerHTML = `
                <div class="config-row">
                    <input type="checkbox" id="autoOpenToggle">
                    <label for="autoOpenToggle">Tự động mở rương phúc lợi & nhận thưởng cột mốc</label>
                </div>
                <span id="chestScriptStatus">Trạng thái: Đang chờ...</span>
            `;
            countdownTimer.parentNode.insertBefore(configDiv, countdownTimer.nextSibling);

            const toggleSwitch = document.getElementById('autoOpenToggle');
            if (toggleSwitch) {
                toggleSwitch.checked = isAutoRunOnLoadEnabled;

                toggleSwitch.addEventListener('change', (event) => {
                    isAutoRunOnLoadEnabled = event.target.checked;
                    localStorage.setItem(LOCAL_STORAGE_KEY_TOGGLE, isAutoRunOnLoadEnabled);
                    updateScriptStatus(`Tự động: ${isAutoRunOnLoadEnabled ? 'BẬT' : 'TẮT'}`);

                    if (isAutoRunOnLoadEnabled) {
                        isScriptRunning = true;
                        checkAndOpenChest();
                    } else {
                        isScriptRunning = false;
                        stopCurrentScriptRun('Người dùng đã tắt');
                    }
                });
            }

            uiCreated = true;
            updateScriptStatus(`Tự động: ${isAutoRunOnLoadEnabled ? 'BẬT' : 'TẮT'}`);
            if (isAutoRunOnLoadEnabled) {
                isScriptRunning = true;
                checkAndOpenChest();
            }
        }
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    const observer = new MutationObserver((mutations, obs) => {
        const countdownTimer = document.getElementById('countdown-timer');
        if (countdownTimer && !uiCreated) {
            createUI();
            obs.disconnect();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        createUI();
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            createUI();
        });
    }

})();
