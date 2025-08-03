// ==UserScript==
// @name         HH3D Khoang Mach
// @namespace    https://github.com/drtrune/hoathinh3d.script/
// @version      3.3
// @description  Tự động hóa quá trình khai thác khoáng mạch: chọn mỏ cụ thể, điều hướng, vào mỏ, xem chi tiết, kiểm tra và nhận thưởng theo điều kiện.
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/khoang-mach*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Khoáng Mạch] Script tải thành công.');

    // --- CẤU HÌNH & BIẾN TOÀN CỤC ---
    const CONFIG = {
        LOCAL_STORAGE_PREFIX: 'hoathinh3d_auto_mine_',
        DEFAULT_MINE_ID: '34', // Thiên Tinh Tiên Vực
        DEFAULT_REWARD_MODE: 'any', // Bất kỳ
        DEFAULT_AUTO_START: false,
        DEFAULT_REFRESH_MINUTES: 2, // Mặc định 2 phút refresh 1 lần
        TIMEOUT_ELEMENT_STABLE: 15000, // 15 giây chờ phần tử ổn định
        INTERVAL_ELEMENT_CHECK: 500, // 0.5 giây kiểm tra lại
        TIMEOUT_COOLDOWN_CLAIMED: 30 * 60 * 1000, // 30 phút sau khi nhận thưởng
        TIMEOUT_COOLDOWN_NOT_READY: 5 * 60 * 1000, // 5 phút nếu chưa đủ điều kiện/nút disabled
        TIMEOUT_RETRY_NO_DATA: 10 * 1000, // 10 giây nếu không đọc được data
        TIMEOUT_RETRY_NO_ROW: 5 * 1000, // 5 giây nếu không tìm thấy hàng người chơi
        TIMEOUT_CLICK_DELAY: 500, // Độ trễ trước khi click
        TIMEOUT_PAGE_NAV_WAIT: 2000, // 2 giây chờ sau khi chuyển trang/vào mỏ
    };

    let selectedMineId = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'id') || CONFIG.DEFAULT_MINE_ID;
    let selectedRewardMode = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'reward_mode') || CONFIG.DEFAULT_REWARD_MODE;
    let autoStartEnabled = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'auto_start') === 'true';
    let refreshMinutes = parseInt(localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'refresh_minutes'), 10) || CONFIG.DEFAULT_REFRESH_MINUTES;


    let isAutoRunning = false;
    let currentTimerId = null;
    let refreshTimerId = null;
    let isUIMade = false;
    let uiObserver = null;
    let currentPlayerId = null;
    let statusElement = null; // Thêm biến để lưu phần tử trạng thái

    const MINING_LOCATIONS_MAP = new Map([
        // Thượng (Gold)
        ['51', { name: "Thiên", type: "gold" }], ['52', { name: "Địa", type: "gold" }], ['53', { name: "Huyền", type: "gold" }],
        ['54', { name: "Hoàng", type: "gold" }], ['55', { name: "Hồng Hoang", type: "gold" }], ['56', { name: "Thần Sơn", type: "gold" }],
        ['64', { name: "Hỗn Độn", type: "gold" }], ['73', { name: "Thái Cổ", type: "gold" }],
        // Trung (Silver)
        ['31', { name: "Dị Vực", type: "silver" }], ['32', { name: "Bất Diệt Sơn", type: "silver" }], ['33', { name: "Táng Thần Chi Địa", type: "silver" }],
        ['34', { name: "Thiên Tinh Tiên Vực", type: "silver" }], ['35', { name: "Càn Nguyên Tiên Vực", type: "silver" }], ['36', { name: "Thiên Hỏa Tiên Vực", type: "silver" }],
        ['37', { name: "Huyền Thiên Tiên Vực", type: "silver" }], ['38', { name: "Thiên Cung Đại Lục", type: "silver" }], ['39', { name: "Tam Thiên Đạo Châu", type: "silver" }],
        ['40', { name: "Thái Cổ Thần Sơn", type: "silver" }], ['41', { name: "Tiểu Thiên U Cảnh", type: "silver" }], ['42', { name: "Đông Thắng Thần Châu", type: "silver" }],
        ['43', { name: "Khai Nguyên Tiên Vực", type: "silver" }], ['44', { name: "Đế Thành Nguyên Thủy", type: "silver" }], ['45', { name: "Tiên Điện", type: "silver" }],
        ['46', { name: "Diêu Quang Thánh Địa", type: "silver" }], ['47', { name: "Bất Tử Sơn", type: "silver" }], ['48', { name: "Nguyên Cảnh Tiên Vực", type: "silver" }],
        ['49', { name: "Ma Vực", type: "silver" }], ['50', { name: "Độ Tiên Môn", type: "silver" }], ['57', { name: "Tiên Cương Đại Lục", type: "silver" }],
        ['58', { name: "Thiên Huyền Đại Lục", type: "silver" }], ['59', { name: "Chu Tước Tinh", type: "silver" }], ['60', { name: "Thông Thiên Kiếm Phái", type: "silver" }],
        ['61', { name: "Vũ Hóa Môn", type: "silver" }], ['62', { name: "Vạn Xà Cốc", type: "silver" }], ['65', { name: "Luân Hồi Vực", type: "silver" }],
        ['66', { name: "Dao Trì Thánh Địa", type: "silver" }], ['67', { name: "Cửu U Vực", type: "silver" }], ['68', { name: "Hắc Ám Chi Địa", type: "silver" }],
        ['69', { name: "Viễn Cổ Tiên Vực", type: "silver" }], ['70', { name: "Ám Nguyệt Tinh", type: "silver" }], ['71', { name: "Vân Hải", type: "silver" }],
        ['72', { name: "Nam Bình Sơn", type: "silver" }], ['74', { name: "La Thiên Tinh Vực", type: "silver" }], ['75', { name: "Liên Minh Tinh Vực", type: "silver" }],
        ['100000', { name: "Côn Hư TInh Vực", type: "silver" }], ['100001', { name: "Âm Minh Chi Địa", type: "silver" }],['100002', { name: "Huyết Thiên Đại Lục", type: "silver" }],
        // Hạ (Copper)
        ['1', { name: "Thiên Hải", type: "copper" }], ['2', { name: "Thạch Thôn", type: "copper" }], ['3', { name: "Hoang Vực", type: "copper" }],
        ['4', { name: "Hỏa Quốc", type: "copper" }], ['5', { name: "Thái Cổ Thánh Sơn", type: "copper" }], ['6', { name: "Tiên Cổ Giới", type: "copper" }],
        ['8', { name: "Ngọc Thanh Môn", type: "copper" }], ['9', { name: "Cửu U Cốc", type: "copper" }], ['10', { name: "Dạ Lang Thôn", type: "copper" }],
        ['11', { name: "Khô Lâu Sơn", type: "copper" }], ['12', { name: "Lạc Nhật Cao Nguyên", type: "copper" }], ['13', { name: "Mai Cốt Chi Địa", type: "copper" }],
        ['14', { name: "Minh Sa Thôn", type: "copper" }], ['17', { name: "Sa Mạc Thôn", type: "copper" }], ['18', { name: "Phong Ma Cốc", type: "copper" }],
        ['19', { name: "Mộc Hỏa Thôn", type: "copper" }], ['21', { name: "Man Hoang Giới Vực", type: "copper" }], ['22', { name: "Hắc Sơn Tiên Vực", type: "copper" }],
        ['24', { name: "Hắc Thổ Tiên Vực", type: "copper" }], ['25', { name: "Bách Đoạn Sơn", type: "copper" }], ['26', { name: "Thanh Linh Giới", type: "copper" }],
        ['27', { name: "Dãy Núi Ma Thú", type: "copper" }], ['28', { name: "Thạch Quốc", type: "copper" }], ['29', { name: "Tiên Cổ Di Địa", type: "copper" }],
        ['30', { name: "Loạn Tinh Hải", type: "copper" }]
    ]);

    // --- HÀM TIỆN ÍCH CHUNG ---

    /**
     * Cập nhật trạng thái hiển thị trên UI.
     * @param {string} message - Nội dung trạng thái.
     */
    function updateStatus(message) {
        if (statusElement) {
            statusElement.textContent = `Trạng thái: ${message}`;
            console.log(`[Auto Khoáng Mạch] Trạng thái: ${message}`);
        }
    }

    /**
     * Chờ một phần tử xuất hiện trong DOM, hiển thị và không bị disabled.
     * @param {string} selector - CSS selector của phần tử cần chờ.
     * @param {function(Element|null): void} callback - Hàm callback được gọi khi tìm thấy phần tử hoặc hết thời gian chờ.
     * @param {number} timeout - Thời gian chờ tối đa bằng mili giây.
     * @param {number} interval - Khoảng thời gian giữa các lần kiểm tra bằng mili giây.
     */
    function waitForElementStable(selector, callback, timeout = CONFIG.TIMEOUT_ELEMENT_STABLE, interval = CONFIG.INTERVAL_ELEMENT_CHECK) {
        let startTime = Date.now();
        const intervalId = setInterval(() => {
            const foundElement = document.querySelector(selector);
            if (foundElement && foundElement.offsetParent !== null && !foundElement.disabled) {
                console.log(`[Auto Khoáng Mạch] waitForElementStable: Found "${selector}" in ${Date.now() - startTime}ms.`);
                clearInterval(intervalId);
                callback(foundElement);
            } else if (Date.now() - startTime >= timeout) {
                console.warn(`[Auto Khoáng Mạch] waitForElementStable: TIMEOUT waiting for "${selector}" after ${timeout / 1000}s.`);
                clearInterval(intervalId);
                callback(null);
            }
        }, interval);
    }

    /**
     * Thực hiện hành động click một cách an toàn và đáng tin cậy.
     * @param {Element} element - Phần tử DOM cần click.
     * @param {string} elementName - Tên mô tả của phần tử cho mục đích log.
     * @returns {boolean} - True nếu click thành công, False nếu ngược lại.
     */
    function safeClick(element, elementName = 'element') {
        if (!element || element.disabled || element.offsetParent === null) {
            console.warn(`[Auto Khoáng Mạch] Cannot click ${elementName}. Element invalid, disabled, or not visible.`);
            return false;
        }
        try {
            element.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            console.log(`[Auto Khoáng Mạch] Dispatched 'click' event for ${elementName}.`);
            return true;
        } catch (e) {
            console.warn(`[Auto Khoáng Mạch] Error dispatching click for ${elementName}:`, e, "Trying direct click.");
            try {
                element.click();
                console.log(`[Auto Khoáng Mạch] Directly clicked ${elementName}.`);
                return true;
            } catch (e2) {
                console.error(`[Auto Khoáng Mạch] FAILED to click ${elementName} (both methods):`, e2);
                return false;
            }
        }
    }

    /**
     * Thêm CSS tùy chỉnh vào trang.
     * @param {string} css - Chuỗi CSS cần thêm.
     */
    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    /**
     * Lấy User ID của người chơi hiện tại từ link profile.
     */
    function getCurrentPlayerId() {
        if (currentPlayerId) return currentPlayerId;
        const profileLink = document.querySelector('a[href*="/profile/"]');
        if (profileLink) {
            const match = profileLink.href.match(/\/profile\/(\d+)/);
            if (match && match[1]) {
                currentPlayerId = match[1];
                console.log(`[Auto Khoáng Mạch] Current User ID: ${currentPlayerId}`);
                return currentPlayerId;
            }
        }
        console.warn('[Auto Khoáng Mạch] Could not retrieve current User ID from profile link.');
        return null;
    }

    /**
     * Đặt hẹn giờ cho chu kỳ khai thác tiếp theo.
     * @param {number} delayMs - Thời gian chờ bằng mili giây.
     */
    function setNextCycleTimer(delayMs) {
        if (currentTimerId) clearTimeout(currentTimerId);
        currentTimerId = setTimeout(startMiningCycle, delayMs);
        updateStatus(`Chờ ${delayMs / 1000}s cho chu kỳ tiếp theo.`);
    }

    /**
     * Đặt hẹn giờ cho việc refresh trang.
     */
    function setRefreshTimer() {
        if (refreshTimerId) clearTimeout(refreshTimerId);
        if (refreshMinutes > 0) {
            const refreshIntervalMs = refreshMinutes * 60 * 1000;
            refreshTimerId = setTimeout(() => {
                console.log('[Auto Khoáng Mạch] Performing page refresh.');
                window.location.reload();
            }, refreshIntervalMs);
            console.log(`[Auto Khoáng Mạch] Page refresh scheduled in ${refreshMinutes} minutes.`);
        } else {
            console.log('[Auto Khoáng Mạch] Auto refresh is disabled.');
        }
    }

    /**
     * Kiểm tra số Tu Vi hiện tại so với mức tối đa.
     * @returns {boolean} - True nếu Tu Vi đã đạt tối đa, False nếu chưa.
     */
    function checkMaxTuVi() {
        const tuviStat = document.querySelector('.stat-tuvi');
        if (!tuviStat) {
            console.warn('[Auto Khoáng Mạch] Could not find Tu Vi stat element. Skipping check.');
            return false;
        }
        const textContent = tuviStat.textContent.trim();
        const match = textContent.match(/Tu Vi:\s*(\d+)\s*\/\s*(\d+)/);
        if (match) {
            const currentTuVi = parseInt(match[1], 10);
            const maxTuVi = parseInt(match[2], 10);
            console.log(`[Auto Khoáng Mạch] Current Tu Vi: ${currentTuVi} / ${maxTuVi}`);
            if (currentTuVi >= maxTuVi) {
                return true;
            }
        } else {
            console.warn('[Auto Khoáng Mạch] Failed to parse Tu Vi text. Skipping check.');
        }
        return false;
    }


    // --- HÀM XỬ LÝ LOGIC CHÍNH ---

    /**
     * Đọc thời gian khai thác còn lại từ một user-row cụ thể.
     */
    function getRemainingMiningTime(userRowElement) {
        const khaiThacSpan = userRowElement.querySelector('span.khai-thac');
        if (khaiThacSpan) {
            const text = khaiThacSpan.textContent.trim();
            console.log(`[Auto Khoáng Mạch] Raw mining time text: "${text}"`);
            if (text === 'Đạt tối đa') {
                console.log('[Auto Khoáng Mạch] Mining time: Đạt tối đa.');
                return 0;
            }

            const minuteMatch = text.match(/(\d+)\s*phút/);
            const secondMatch = text.match(/(\d+)\s*giây/);

            if (minuteMatch) {
                const minutes = parseInt(minuteMatch[1]);
                const totalMs = minutes * 60 * 1000;
                console.log(`[Auto Khoáng Mạch] Parsed mining time: ${minutes} phút (${totalMs}ms).`);
                return totalMs;
            }
            if (secondMatch) {
                const seconds = parseInt(secondMatch[1]);
                const totalMs = seconds * 1000;
                console.log(`[Auto Khoáng Mạch] Parsed mining time: ${seconds} giây (${totalMs}ms).`);
                return totalMs;
                }
        }
        console.warn('[Auto Khoáng Mạch] Failed to read mining time or format unrecognized. Returning -1.');
        return -1;
    }

    /**
     * Kiểm tra phần trăm thưởng thêm Tu Vi.
     */
    function getTuViBonusPercentage() {
        const tuviBonusSpan = document.querySelector('span#tuvi-bonus-percentage');
        if (tuviBonusSpan) {
            const text = tuviBonusSpan.textContent.trim();
            console.log(`[Auto Khoáng Mạch] Raw Tu Vi bonus text: "${text}"`);
            const match = text.match(/(\d+)%/);
            if (match) {
                const percentage = parseInt(match[1]);
                console.log(`[Auto Khoáng Mạch] Parsed Tu Vi bonus: ${percentage}%.`);
                return percentage;
            }
        }
        console.warn('[Auto Khoáng Mạch] Failed to read Tu Vi bonus percentage or format unrecognized. Returning -1.');
        return -1;
    }

    /**
     * Xử lý hàng của người chơi hiện tại trong giao diện chi tiết mỏ.
     */
    function processPlayerMineRow() {
        updateStatus('Đang xử lý thông tin khai thác...');
        currentPlayerId = getCurrentPlayerId();
        let playerRow = null;

        if (currentPlayerId) {
            // Cải tiến logic: Tìm trực tiếp hàng của người chơi (div.user-row) bằng data-user-id
            playerRow = document.querySelector(`div.user-row[data-user-id="${currentPlayerId}"]`);

            if (playerRow) {
                console.log(`[Auto Khoáng Mạch] Found player's own row with ID: ${currentPlayerId}.`);
            } else {
                console.log(`[Auto Khoáng Mạch] Player's own row (ID: ${currentPlayerId}) not found.`);
            }
        } else {
            console.log('[Auto Khoáng Mạch] Current User ID not available.');
        }

        // Nếu không tìm thấy hàng của chính mình, tìm một hàng bất kỳ đang có sẵn
        if (!playerRow) {
            console.log('[Auto Khoáng Mạch] Searching for any claimable user row (first 2 rows).');
            const userRows = document.querySelectorAll('div#user-list div.user-row');
            for (let i = 0; i < Math.min(userRows.length, 2); i++) {
                const row = userRows[i];
                const claimButton = row.querySelector('button.claim-reward:not(:disabled)');
                const khaiThacSpan = row.querySelector('span.khai-thac');
                if (claimButton && khaiThacSpan && khaiThacSpan.textContent.trim() === 'Đạt tối đa') {
                    playerRow = row;
                    console.log(`[Auto Khoáng Mạch] Found claimable row for user ID: ${row.dataset.userId || 'unknown'}.`);
                    break;
                }
            }
        }

        if (playerRow) {
            const remainingTimeMs = getRemainingMiningTime(playerRow);
            const claimButton = playerRow.querySelector('button.claim-reward');
            const notReadyButton = playerRow.querySelector('button.chua-dat'); // Thêm dòng này để tìm nút "chưa đạt"

            if (remainingTimeMs === 0) { // Mining is maxed
                // Logic xử lý nhận thưởng...
                const tuviBonus = getTuViBonusPercentage();
                let shouldClaim = false;

                switch (selectedRewardMode) {
                    case 'any':
                        shouldClaim = true;
                        break;
                    case '20%':
                        shouldClaim = tuviBonus >= 20;
                        break;
                    case '100%':
                        shouldClaim = tuviBonus >= 100;
                        break;
                }

                if (shouldClaim && claimButton && !claimButton.disabled) {
                    updateStatus(`Đang nhận thưởng với bonus ${tuviBonus}%.`);
                    setTimeout(() => {
                        if (safeClick(claimButton, 'Claim Reward Button')) {
                            updateStatus('Đã nhận thưởng. Chờ chu kỳ tiếp theo.');
                            setNextCycleTimer(CONFIG.TIMEOUT_COOLDOWN_CLAIMED);
                        } else {
                            updateStatus('Lỗi khi nhấn nút nhận thưởng. Thử lại sau 10s.');
                            setNextCycleTimer(10 * 1000);
                        }
                    }, CONFIG.TIMEOUT_CLICK_DELAY);
                } else {
                    updateStatus(`Không nhận thưởng (bonus: ${tuviBonus}%, cần: ${selectedRewardMode}). Chờ.`);
                    setNextCycleTimer(CONFIG.TIMEOUT_COOLDOWN_NOT_READY);
                }
            } else if (remainingTimeMs > 0) { // Still mining
                updateStatus(`Đang khai thác. Sẽ kiểm tra lại sau ${Math.ceil(CONFIG.TIMEOUT_COOLDOWN_NOT_READY / 1000)}s.`);
                setNextCycleTimer(CONFIG.TIMEOUT_COOLDOWN_NOT_READY);
            } else { // remainingTimeMs === -1 (couldn't read)
                updateStatus('Không đọc được thời gian khai thác. Thử lại sau 1 phút.');
                setNextCycleTimer(60 * 1000);
            }
        } else {
            updateStatus('Không tìm thấy hàng của người chơi. Thử lại sau.');
            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_ROW);
        }
    }

    /**
     * Chuyển đổi loại khoáng mạch (Thượng/Trung/Hạ) nếu cần.
     * @param {string} mineType - 'gold', 'silver', or 'copper'.
     * @param {function(): void} nextStep - Callback to proceed after type switch.
     */
    function switchMineType(mineType, nextStep) {
        updateStatus(`Đang chuyển sang loại mỏ "${mineType}".`);
        const currentActiveButton = document.querySelector('button.mine-type-button.active');
        if (currentActiveButton && currentActiveButton.dataset.mineType === mineType) {
            console.log(`[Auto Khoáng Mạch] Already on "${mineType}" mine type.`);
            nextStep();
            return;
        }

        const targetButton = document.querySelector(`button.mine-type-button[data-mine-type="${mineType}"]`);
        if (targetButton) {
            setTimeout(() => {
                if (safeClick(targetButton, `"${mineType}" mine type button`)) {
                    waitForElementStable('div.mine-image[data-mine-id]', nextStep, CONFIG.TIMEOUT_ELEMENT_STABLE, CONFIG.INTERVAL_ELEMENT_CHECK);
                } else {
                    updateStatus('Lỗi khi chuyển loại mỏ. Thử lại sau.');
                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                }
            }, CONFIG.TIMEOUT_CLICK_DELAY);
        } else {
            updateStatus(`Không tìm thấy nút loại mỏ "${mineType}". Vui lòng kiểm tra lại ID mỏ đã chọn. Dừng auto.`);
            stopAuto();
        }
    }

    /**
     * Chuyển trang trong danh sách khoáng mạch.
     * @param {string} direction - 'next' or 'prev'.
     * @param {function(): void} nextStep - Callback to proceed after page switch.
     */
    function switchMiningPage(direction, nextStep) {
        updateStatus(`Đang chuyển sang trang ${direction}.`);
        const pageButton = document.querySelector(`button.page-button.${direction}`);
        if (pageButton && !pageButton.disabled) {
            console.log(`[Auto Khoáng Mạch] Switching to ${direction} page.`);
            setTimeout(() => {
                if (safeClick(pageButton, `${direction} page button`)) {
                    waitForElementStable('div.mine-image[data-mine-id]', nextStep, CONFIG.TIMEOUT_ELEMENT_STABLE, CONFIG.INTERVAL_ELEMENT_CHECK);
                } else {
                    updateStatus('Lỗi khi chuyển trang. Thử lại sau.');
                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                }
            }, CONFIG.TIMEOUT_CLICK_DELAY);
        } else {
            console.warn(`[Auto Khoáng Mạch] ${direction} page button not found or disabled. End of pages?`);
            nextStep(); // Assume it's fine, continue
        }
    }

    /**
     * Điều hướng đến trang mỏ mục tiêu và click nút "Vào Ngay", sau đó xác nhận.
     * @param {string} targetMineId - ID của mỏ cần vào.
     * @param {function(): void} nextStep - Callback khi đã vào trang chi tiết mỏ và xử lý xác nhận.
     */
    function navigateAndEnterMine(targetMineId, nextStep) {
        updateStatus(`Đang tìm và vào mỏ ID ${targetMineId}.`);
        const enterButton = document.querySelector(`button.enter-mine[data-mine-id="${targetMineId}"]`);

        if (enterButton && enterButton.offsetParent !== null && !enterButton.disabled) {
            console.log(`[Auto Khoáng Mạch] Found "Vào Ngay" for mine ID ${targetMineId}. Clicking.`);
            setTimeout(() => {
                if (safeClick(enterButton, `Enter Mine Button (ID: ${targetMineId})`)) {
                    // Step 1: Wait for confirmation dialog (swal2)
                    waitForElementStable('button.swal2-confirm.swal2-styled[aria-label=""]', (confirmButton) => {
                        if (confirmButton) {
                            updateStatus('Đã tìm thấy hộp thoại xác nhận. Đang xác nhận...');
                            setTimeout(() => {
                                safeClick(confirmButton, 'Confirm "Có, vào ngay" button');
                                // Step 2: Wait for leave mine button (on detail page)
                                waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveBtn) => {
                                    if (leaveBtn) {
                                        updateStatus(`Đã vào trang chi tiết mỏ ID ${targetMineId}.`);
                                        nextStep();
                                    } else {
                                        updateStatus('Lỗi: Không xác nhận được trang chi tiết mỏ. Thử lại sau.');
                                        setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                                    }
                                }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                            }, CONFIG.TIMEOUT_CLICK_DELAY);
                        } else {
                            updateStatus('Hộp thoại xác nhận không được tìm thấy. Đang chờ trang chi tiết...');
                            // If confirmation dialog not found, directly wait for leave mine button
                            waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveBtn) => {
                                if (leaveBtn) {
                                    updateStatus(`Đã vào trang chi tiết mỏ ID ${targetMineId}.`);
                                    nextStep();
                                } else {
                                    updateStatus('Lỗi: Không tìm thấy nút "Rời Khỏi". Thử lại sau.');
                                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                                }
                            }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                        }
                    }, 7000); // 7s for confirmation dialog
                } else {
                    updateStatus('Lỗi khi nhấn nút "Vào Ngay". Thử lại sau.');
                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                }
            }, CONFIG.TIMEOUT_CLICK_DELAY);
        } else {
            // Button not found on current page, try next page
            const currentPageElem = document.querySelector('.pagination-info .current-page');
            const totalPagesElem = document.querySelector('.pagination-info .total-pages');
            const currentPage = parseInt(currentPageElem?.textContent || '1');
            const totalPages = parseInt(totalPagesElem?.textContent || '1');

            if (currentPage < totalPages) {
                updateStatus(`Nút "Vào Ngay" không có trên trang này. Đang chuyển sang trang ${currentPage + 1}/${totalPages}.`);
                switchMiningPage('next', () => navigateAndEnterMine(targetMineId, nextStep));
            } else {
                updateStatus(`Đã tìm hết các trang, không tìm thấy mỏ ID ${targetMineId}. Dừng auto.`);
                stopAuto();
            }
        }
    }

    /**
     * Click vào hình ảnh mỏ để mở giao diện chi tiết (modal).
     * @param {string} targetMineId - ID của mỏ.
     * @param {function(): void} nextStep - Callback khi hình ảnh đã được click và nội dung tải.
     */
    function clickMineImageForDetails(targetMineId, nextStep) {
        updateStatus(`Đang mở chi tiết mỏ ID ${targetMineId}.`);
        const mineImageDiv = document.querySelector(`div.mine-image[data-mine-id="${targetMineId}"]`);
        if (mineImageDiv && mineImageDiv.offsetParent !== null) {
            setTimeout(() => {
                if (safeClick(mineImageDiv, `Mine Image (ID: ${targetMineId})`)) {
                    // Wait for the user rows to load inside the detail modal
                    // Corrected selector: using 'div#user-list div.user-row'
                    waitForElementStable('div#user-list div.user-row', (userRow) => {
                        if (userRow) {
                            console.log('[Auto Khoáng Mạch] Mine details (user-row) loaded.');
                            nextStep();
                        } else {
                            updateStatus('Không tải được chi tiết mỏ. Thử lại sau.');
                            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                        }
                    }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                } else {
                    updateStatus('Lỗi khi nhấn vào hình ảnh mỏ. Thử lại sau.');
                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                }
            }, CONFIG.TIMEOUT_CLICK_DELAY);
        } else {
            updateStatus(`Không tìm thấy hình ảnh mỏ ID ${targetMineId}. Thử lại sau.`);
            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
        }
    }

    /**
     * Kiểm tra xem đang ở trong trang chi tiết mỏ đã chọn hay không (có nút "Rời Khỏi").
     * Hàm này KHÔNG kiểm tra xem modal chi tiết mỏ có mở và dữ liệu có sẵn hay không.
     * @param {string} targetMineId - ID của mỏ.
     * @param {function(boolean): void} callback - Callback với true nếu đang ở trong trang chi tiết mỏ, false nếu không.
     */
    function checkOnMineDetailPage(targetMineId, callback) {
        updateStatus('Đang kiểm tra trang chi tiết mỏ...');
        waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveButton) => {
            if (leaveButton) {
                console.log(`[Auto Khoáng Mạch] Confirmed on mine detail page for ID ${targetMineId}.`);
                callback(true);
            } else {
                console.log(`[Auto Khoáng Mạch] Not on mine detail page for ID ${targetMineId}.`);
                callback(false);
            }
        }, 5000); // 5s for leave button
    }


    /**
     * Hàm chính của vòng lặp khai thác.
     * Sẽ được gọi lại sau mỗi chu kỳ kiểm tra/hành động.
     */
    function startMiningCycle() {
        if (!isAutoRunning) {
            updateStatus('Đã dừng. Chờ lệnh mới.');
            return;
        }
        if (currentTimerId) {
            clearTimeout(currentTimerId);
            currentTimerId = null;
        }
        updateStatus('Bắt đầu chu kỳ khai thác mới...');
        console.log('--- [Auto Khoáng Mạch] Starting new mining cycle. ---');

        // Thêm chức năng kiểm tra Tu Vi tại đây
        if (checkMaxTuVi()) {
            stopAuto();
            updateStatus('Tu Vi đã đạt tối đa. Tự động dừng.');
            return;
        }

        const targetMineInfo = MINING_LOCATIONS_MAP.get(selectedMineId);
        if (!targetMineInfo) {
            updateStatus(`LỖI: Không tìm thấy ID mỏ ${selectedMineId}. Dừng auto.`);
            stopAuto();
            return;
        }

        // 1. Kiểm tra loại mỏ và nhấn vào nút loại mỏ thượng/trung/hạ.
        switchMineType(targetMineInfo.type, () => {
            // 2. Kiểm tra xem người dùng có trên trang chi tiết mỏ không (có nút "Rời Khỏi" không).
            checkOnMineDetailPage(selectedMineId, (isOnDetailPage) => {
                if (isOnDetailPage) {
                    // Nếu đã ở trên trang chi tiết mỏ (có nút "Rời Khỏi"), thì click vào hình ảnh mỏ để mở modal chứa thông tin khai thác.
                    clickMineImageForDetails(selectedMineId, () => {
                        processPlayerMineRow(); // This function will schedule the next cycle
                    });
                } else {
                    // Nếu không ở trên trang chi tiết mỏ, script sẽ tìm nút "Vào Ngay" cho mỏ đó.
                    navigateAndEnterMine(selectedMineId, () => {
                        // Sau khi vào trang chi tiết mỏ, click vào hình ảnh mỏ để mở modal chứa thông tin khai thác.
                        clickMineImageForDetails(selectedMineId, () => {
                            processPlayerMineRow();
                        });
                    });
                }
            });
        });
    }

    /**
     * Dừng toàn bộ quá trình tự động hóa.
     */
    function stopAuto() {
        isAutoRunning = false;
        if (currentTimerId) {
            clearTimeout(currentTimerId);
            currentTimerId = null;
        }
        if (refreshTimerId) { // Clear refresh timer
            clearTimeout(refreshTimerId);
            refreshTimerId = null;
        }
        const startButton = document.querySelector('#startButton');
        const stopButton = document.querySelector('#stopButton');
        if (startButton) {
            startButton.textContent = 'Bắt đầu Auto';
            startButton.disabled = false;
        }
        if (stopButton) {
            stopButton.disabled = true;
        }
        updateStatus('Đã dừng auto.');
    }

    /**
     * Bắt đầu tự động hóa.
     */
    function startAuto() {
        if (!isAutoRunning) {
            isAutoRunning = true;
            const startButton = document.querySelector('#startButton');
            const stopButton = document.querySelector('#stopButton');
            if (startButton) {
                startButton.textContent = 'Đang chạy...';
                startButton.disabled = true;
            }
            if (stopButton) {
                stopButton.disabled = false;
            }
            updateStatus('Auto đã khởi động.');
            setRefreshTimer(); // Bắt đầu đặt hẹn giờ refresh khi auto khởi động
            startMiningCycle();
        }
    }

    // --- KHỞI TẠO UI ---

    /**
     * Tạo và chèn giao diện người dùng (UI) cho script.
     */
    function createUI() {
        if (isUIMade) {
            console.log('[Auto Khoáng Mạch] UI already created. Skipping.');
            return;
        }

        addStyle(`
#autoMineConfig {
    /* Giới hạn kích thước và căn giữa */
    position: relative;
    width: fit-content;
    max-width: 320px;
    max-height: 400px;
    overflow: auto;
    margin: 15px auto 20px auto;

    /* Thiết kế chung */
    background: rgba(33, 37, 43, 0.95);
    color: #e0e0e0;
    padding: 8px 12px;
    border-radius: 8px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    z-index: 9999;
    border: 1px solid #444;

    /* Bố cục chính */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}

#autoMineConfig .config-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: 100%;
}

#autoMineConfig .config-group.checkbox-group,
#autoMineConfig .button-group,
#autoMineConfig .refresh-time-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
}

#autoMineConfig .config-group.checkbox-group {
    margin-top: 5px;
}

#autoMineConfig label {
    font-weight: 600;
    color: #87CEFA;
    white-space: nowrap;
    margin-bottom: 0px;
}

#autoMineConfig select,
#autoMineConfig button,
#autoMineConfig input[type="number"] {
    background: #444;
    color: #fff;
    border: 1px solid #666;
    border-radius: 5px;
    padding: 6px 10px;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    font-size: 13px;
}

#autoMineConfig input[type="number"] {
    max-width: 100px;
    text-align: center;
}

#autoMineConfig select:focus,
#autoMineConfig button:focus,
#autoMineConfig input[type="number"]:focus {
    outline: none;
    border-color: #00BFFF;
    box-shadow: 0 0 0 2px rgba(0, 191, 255, 0.3);
}

#autoMineConfig button {
    font-weight: bold;
    transition: background-color 0.2s, transform 0.1s, box-shadow 0.2s;
    text-transform: uppercase;
}

#autoMineConfig button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
}

#autoMineConfig button.start-button {
    background-color: #28a745;
}

#autoMineConfig button.start-button:hover {
    background-color: #218838;
}

#autoMineConfig button.stop-button {
    background-color: #dc3545;
}

#autoMineConfig button.stop-button:hover {
    background-color: #c82333;
}

#autoMineConfig input[type="checkbox"] {
    margin: 0;
    width: auto;
    cursor: pointer;
}

#autoMineConfig #statusDisplay {
    margin-top: 5px;
    color: #f0f0f0;
    font-style: italic;
    text-align: center;
    min-height: 20px;
    width: 100%;
}

#autoMineConfig .tooltip-container {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
}

#autoMineConfig .tooltip-container .tooltiptext {
    visibility: hidden;
    width: 180px;
    background-color: #555;
    color: #fff;
    text-align: center;
    border-radius: 6px;
    padding: 5px;
    position: absolute;
    z-index: 1;
    bottom: 125%;
    left: 50%;
    margin-left: -90px;
    opacity: 0;
    transition: opacity 0.3s;
    font-size: 11px;
    white-space: normal;
}

#autoMineConfig .tooltip-container:hover .tooltiptext {
    visibility: visible;
    opacity: 1;
}
`);


        waitForElementStable('div.mine-buttons', (targetDiv) => {
            if (!targetDiv || isUIMade) return;

            const configDiv = document.createElement('div');
            configDiv.id = 'autoMineConfig';

            let mineOptionsHtml = Array.from(MINING_LOCATIONS_MAP.entries()).map(([id, info]) =>
                `<option value="${id}">${id} - ${info.name} (${info.type === 'gold' ? 'Thượng' : (info.type === 'silver' ? 'Trung' : 'Hạ')})</option>`
            ).join('');

            configDiv.innerHTML = `
    <div class="config-group">
        <label for="specificMineSelect">Chọn Khoáng Mạch:</label>
        <select id="specificMineSelect">${mineOptionsHtml}</select>
    </div>
    <div class="config-group">
        <label for="rewardModeSelect">Chế độ Nhận Thưởng:</label>
        <select id="rewardModeSelect">
            <option value="100%">Thưởng thêm >= 100%</option>
            <option value="20%">Thưởng thêm >= 20%</option>
            <option value="any">Bất kỳ</option>
        </select>
    </div>
    <div class="config-group checkbox-group">
        <input type="checkbox" id="autoStartCheckbox">
        <label for="autoStartCheckbox">Tự động hoàn toàn khi tải trang</label>
    </div>
    <div class="refresh-time-group">
        <div class="tooltip-container">
            <label for="refreshInput">Tự động refresh trang (phút):</label>
            <span class="tooltiptext">Nhập 0 để tắt.</span>
        </div>
        <input type="number" id="refreshInput" min="0">
    </div>
    <div class="button-group">
        <button id="startButton" class="start-button">Bắt đầu Auto</button>
        <button id="stopButton" class="stop-button">Dừng Auto</button>
    </div>
    <div id="statusDisplay"></div>
`;
            targetDiv.parentNode.insertBefore(configDiv, targetDiv.nextSibling);

            const specificMineSelect = configDiv.querySelector('#specificMineSelect');
            const rewardModeSelect = configDiv.querySelector('#rewardModeSelect');
            const autoStartCheckbox = configDiv.querySelector('#autoStartCheckbox');
            const refreshInput = configDiv.querySelector('#refreshInput');
            const startButton = configDiv.querySelector('#startButton');
            const stopButton = configDiv.querySelector('#stopButton');
            statusElement = configDiv.querySelector('#statusDisplay');


            specificMineSelect.value = selectedMineId;
            // Fallback for old reward modes
            if (!['100%', '20%', 'any'].includes(selectedRewardMode)) {
                selectedRewardMode = 'any'; // Default to 'Bất kỳ' if old mode is found
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'reward_mode', selectedRewardMode);
            }
            rewardModeSelect.value = selectedRewardMode;
            autoStartCheckbox.checked = autoStartEnabled;
            refreshInput.value = refreshMinutes;

            specificMineSelect.addEventListener('change', (event) => {
                selectedMineId = event.target.value;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'id', selectedMineId);
                console.log(`[Auto Khoáng Mạch] Mine ID set to: ${selectedMineId}`);
            });

            rewardModeSelect.addEventListener('change', (event) => {
                selectedRewardMode = event.target.value;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'reward_mode', selectedRewardMode);
                console.log(`[Auto Khoáng Mạch] Reward mode set to: ${selectedRewardMode}`);
            });

            autoStartCheckbox.addEventListener('change', (event) => {
                autoStartEnabled = event.target.checked;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'auto_start', autoStartEnabled);
                console.log(`[Auto Khoáng Mạch] Auto start on load: ${autoStartEnabled}`);
            });

            refreshInput.addEventListener('change', (event) => {
                refreshMinutes = parseInt(event.target.value, 10);
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'refresh_minutes', refreshMinutes);
                console.log(`[Auto Khoáng Mạch] Auto refresh set to: ${refreshMinutes} minutes.`);
                if (isAutoRunning) {
                    setRefreshTimer(); // Cập nhật lại timer nếu đang chạy
                }
            });

            startButton.addEventListener('click', startAuto);
            stopButton.addEventListener('click', stopAuto);

            // Update button states based on initial running status
            if (isAutoRunning) {
                startButton.textContent = 'Đang chạy...';
                startButton.disabled = true;
                stopButton.disabled = false;
            } else {
                startButton.textContent = 'Bắt đầu Auto';
                startButton.disabled = false;
                stopButton.disabled = true;
            }
            updateStatus('Sẵn sàng.');

            isUIMade = true;
            console.log('[Auto Khoáng Mạch] UI created.');

            if (autoStartEnabled && !isAutoRunning) {
                console.log('[Auto Khoáng Mạch] Auto start enabled. Starting auto.');
                startAuto();
            }
        });
    }

    // --- KHỞI TẠO SCRIPT ---

    /**
     * Hàm khởi tạo chính, sẽ được gọi khi DOM sẵn sàng.
     */
    function initializeScript() {
        if (isUIMade) return; // Prevent double initialization
        console.log('[Auto Khoáng Mạch] Initializing script...');
        createUI();
    }

    // Use MutationObserver to detect when the target element for UI (`div.mine-buttons`) is available.
    // This is more robust than just DOMContentLoaded or window.load for dynamically loaded content.
    uiObserver = new MutationObserver((mutations, observer) => {
        if (!isUIMade && document.querySelector('div.mine-buttons')) {
            console.log('[Auto Khoáng Mạch] MutationObserver detected mine-buttons. Attempting UI creation.');
            initializeScript();
            observer.disconnect(); // Disconnect once UI creation is initiated
        }
    });

    // Start observing the body for changes
    uiObserver.observe(document.body, { childList: true, subtree: true });

    // Also, try to initialize on DOMContentLoaded as a fallback for faster loading pages
    window.addEventListener('DOMContentLoaded', initializeScript);
    // And on window.load to ensure everything is fully rendered, though MutationObserver should catch it first
    window.addEventListener('load', () => {
        if (uiObserver) {
            uiObserver.disconnect(); // Ensure observer is disconnected
        }
        initializeScript();
    });

})();
