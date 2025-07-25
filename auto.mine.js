// ==UserScript==
// @name         HoatHinh3D Auto Khoang Mach (Optimized v3.0)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Tự động hóa quá trình khai thác khoáng mạch: chọn mỏ cụ thể, điều hướng, vào mỏ, xem chi tiết, kiểm tra và nhận thưởng theo điều kiện. Hỗ trợ tự động chạy khi tải trang và xử lý hộp thoại xác nhận.
// @author       Bạn
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
        TIMEOUT_ELEMENT_STABLE: 15000, // 15 giây chờ phần tử ổn định
        INTERVAL_ELEMENT_CHECK: 500, // 0.5 giây kiểm tra lại
        TIMEOUT_COOLDOWN_CLAIMED: 30 * 60 * 1000, // 30 phút sau khi nhận thưởng
        TIMEOUT_COOLDOWN_NOT_READY: 5 * 60 * 1000, // 5 phút nếu chưa đủ điều kiện/nút disabled
        TIMEOUT_RETRY_NO_DATA: 10 * 1000, // 10 giây nếu không đọc được data
        TIMEOUT_RETRY_NO_ROW: 5 * 1000, // 5 giây nếu không tìm thấy hàng người chơi
        TIMEOUT_CLICK_DELAY: 500, // Độ trễ trước khi click
        TIMEOUT_PAGE_NAV_WAIT: 2000 // 2 giây chờ sau khi chuyển trang/vào mỏ
    };

    let selectedMineId = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'id') || CONFIG.DEFAULT_MINE_ID;
    let selectedRewardMode = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'reward_mode') || CONFIG.DEFAULT_REWARD_MODE;
    let autoStartEnabled = localStorage.getItem(CONFIG.LOCAL_STORAGE_PREFIX + 'auto_start') === 'true';

    let isAutoRunning = false;
    let currentTimerId = null;
    let isUIMade = false;
    let uiObserver = null;
    let currentPlayerId = null; // Sẽ được lấy khi cần thiết

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
        console.log(`[Auto Khoáng Mạch] Next cycle scheduled in ${delayMs / 1000} seconds.`);
    }

    // --- HÀM XỬ LÝ LOGIC CHÍNH ---

    /**
     * Đọc thời gian khai thác còn lại từ một user-row cụ thể.
     */
    function getRemainingMiningTime(userRowElement) {
        const khaiThacSpan = userRowElement.querySelector('span.khai-thac');
        if (khaiThacSpan) {
            const text = khaiThacSpan.textContent.trim();
            if (text === 'Đạt tối đa') return 0;

            const match = text.match(/(\d+)h\s*(\d+)m\s*(\d+)s/);
            if (match) {
                const hours = parseInt(match[1]) || 0;
                const minutes = parseInt(match[2]) || 0;
                const seconds = parseInt(match[3]) || 0;
                return (hours * 3600 + minutes * 60 + seconds) * 1000;
            }
        }
        console.warn('[Auto Khoáng Mạch] Failed to read mining time.');
        return -1;
    }

    /**
     * Kiểm tra phần trăm thưởng thêm Tu Vi.
     */
    function getTuViBonusPercentage() {
        const tuviBonusSpan = document.querySelector('span#tuvi-bonus-percentage');
        if (tuviBonusSpan) {
            const text = tuviBonusSpan.textContent.trim();
            const match = text.match(/(\d+)%/);
            if (match) return parseInt(match[1]);
        }
        console.warn('[Auto Khoáng Mạch] Failed to read Tu Vi bonus percentage.');
        return -1;
    }

    /**
     * Xử lý hàng của người chơi hiện tại trong giao diện chi tiết mỏ.
     */
    function processPlayerMineRow() {
        currentPlayerId = getCurrentPlayerId();
        let playerRow = null;

        if (currentPlayerId) {
            playerRow = document.querySelector(`div.user-row button.claim-reward[data-user-id="${currentPlayerId}"]`)?.closest('div.user-row');
        }

        if (!playerRow) {
            console.log('[Auto Khoáng Mạch] Player-specific row not found. Trying any available claim button.');
            playerRow = document.querySelector('div.user-row button.claim-reward:not(:disabled)')?.closest('div.user-row');
        }

        if (playerRow) {
            const remainingTimeMs = getRemainingMiningTime(playerRow);
            const claimButton = playerRow.querySelector('button.claim-reward');

            if (remainingTimeMs === 0) { // Mining is maxed
                const tuviBonus = getTuViBonusPercentage();
                let shouldClaim = false;

                switch (selectedRewardMode) {
                    case 'any': shouldClaim = true; break;
                    case '0%': shouldClaim = tuviBonus > 0; break;
                    case '20%': shouldClaim = tuviBonus >= 20; break;
                    case '50%': shouldClaim = tuviBonus >= 50; break;
                    case '100%': shouldClaim = tuviBonus >= 100; break;
                }

                if (shouldClaim && claimButton && !claimButton.disabled) {
                    console.log(`[Auto Khoáng Mạch] Claiming reward with ${tuviBonus}% bonus.`);
                    setTimeout(() => {
                        if (safeClick(claimButton, 'Claim Reward Button')) {
                            // After claiming, the mine detail modal remains open.
                            setNextCycleTimer(CONFIG.TIMEOUT_COOLDOWN_CLAIMED);
                        } else {
                            console.error('[Auto Khoáng Mạch] Failed to click claim button. Retrying in 10s.');
                            setNextCycleTimer(10 * 1000);
                        }
                    }, CONFIG.TIMEOUT_CLICK_DELAY);
                } else {
                    console.log(`[Auto Khoáng Mạch] Not claiming (bonus: ${tuviBonus}%, needed: ${selectedRewardMode}). Waiting.`);
                    setNextCycleTimer(CONFIG.TIMEOUT_COOLDOWN_NOT_READY);
                }
            } else if (remainingTimeMs > 0) { // Still mining
                const waitTime = remainingTimeMs + 10000; // Add 10 seconds buffer
                console.log(`[Auto Khoáng Mạch] Still mining. Checking again in ${waitTime / 1000} seconds.`);
                setNextCycleTimer(waitTime);
            } else { // remainingTimeMs === -1 (couldn't read)
                console.warn('[Auto Khoáng Mạch] Could not read mining time. Retrying in 1 minute.');
                setNextCycleTimer(60 * 1000);
            }
        } else {
            console.log('[Auto Khoáng Mạch] No player row found in mine details. Retrying.');
            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_ROW);
        }
    }

    /**
     * Chuyển đổi loại khoáng mạch (Thượng/Trung/Hạ) nếu cần.
     * @param {string} mineType - 'gold', 'silver', or 'copper'.
     * @param {function(): void} nextStep - Callback to proceed after type switch.
     */
    function switchMineType(mineType, nextStep) {
        const currentActiveButton = document.querySelector('button.mine-type-button.active');
        if (currentActiveButton && currentActiveButton.dataset.mineType === mineType) {
            console.log(`[Auto Khoáng Mạch] Already on "${mineType}" mine type.`);
            nextStep();
            return;
        }

        const targetButton = document.querySelector(`button.mine-type-button[data-mine-type="${mineType}"]`);
        if (targetButton) {
            console.log(`[Auto Khoáng Mạch] Switching to mine type: "${mineType}".`);
            safeClick(targetButton, `"${mineType}" mine type button`);
            waitForElementStable('div.mine-image[data-mine-id]', nextStep, CONFIG.TIMEOUT_ELEMENT_STABLE, CONFIG.INTERVAL_ELEMENT_CHECK);
        } else {
            console.error(`[Auto Khoáng Mạch] Could not find "${mineType}" mine type button.`);
            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
        }
    }

    /**
     * Chuyển trang trong danh sách khoáng mạch.
     * @param {string} direction - 'next' or 'prev'.
     * @param {function(): void} nextStep - Callback to proceed after page switch.
     */
    function switchMiningPage(direction, nextStep) {
        const pageButton = document.querySelector(`button.page-button.${direction}`);
        if (pageButton && !pageButton.disabled) {
            console.log(`[Auto Khoáng Mạch] Switching to ${direction} page.`);
            safeClick(pageButton, `${direction} page button`);
            waitForElementStable('div.mine-image[data-mine-id]', nextStep, CONFIG.TIMEOUT_ELEMENT_STABLE, CONFIG.INTERVAL_ELEMENT_CHECK);
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
        const enterButton = document.querySelector(`button.enter-mine[data-mine-id="${targetMineId}"]`);

        if (enterButton && enterButton.offsetParent !== null && !enterButton.disabled) {
            console.log(`[Auto Khoáng Mạch] Found "Vào Ngay" for mine ID ${targetMineId}. Clicking.`);
            setTimeout(() => {
                if (safeClick(enterButton, `Enter Mine Button (ID: ${targetMineId})`)) {
                    // Step 1: Wait for confirmation dialog (swal2)
                    waitForElementStable('button.swal2-confirm.swal2-styled[aria-label=""]', (confirmButton) => {
                        if (confirmButton) {
                            console.log('[Auto Khoáng Mạch] Confirmation dialog found. Clicking "Có, vào ngay".');
                            setTimeout(() => {
                                safeClick(confirmButton, 'Confirm "Có, vào ngay" button');
                                // Step 2: Wait for leave mine button (on detail page)
                                waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveBtn) => {
                                    if (leaveBtn) {
                                        console.log(`[Auto Khoáng Mạch] Confirmed inside mine detail page ID ${targetMineId}.`);
                                        nextStep();
                                    } else {
                                        console.error(`[Auto Khoáng Mạch] Failed to confirm mine detail page after confirmation click.`);
                                        setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                                    }
                                }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                            }, CONFIG.TIMEOUT_CLICK_DELAY);
                        } else {
                            console.warn('[Auto Khoáng Mạch] Confirmation dialog not found or timed out. Assuming it was auto-skipped or error. Waiting for leave mine button.');
                            // If confirmation dialog not found, directly wait for leave mine button
                            waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveBtn) => {
                                if (leaveBtn) {
                                    console.log(`[Auto Khoáng Mạch] Confirmed inside mine detail page ID ${targetMineId} (without explicit confirmation click).`);
                                    nextStep();
                                } else {
                                    console.error(`[Auto Khoáng Mạch] Failed to confirm mine detail page.`);
                                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                                }
                            }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                        }
                    }, 7000); // 7s for confirmation dialog
                } else {
                    console.error(`[Auto Khoáng Mạch] Failed to click "Vào Ngay" button.`);
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
                console.log(`[Auto Khoáng Mạch] "Vào Ngay" button not on current page. Moving to next page (${currentPage + 1}/${totalPages}).`);
                switchMiningPage('next', () => navigateAndEnterMine(targetMineId, nextStep));
            } else {
                console.warn(`[Auto Khoáng Mạch] Searched all pages, "Vào Ngay" button for mine ID ${targetMineId} not found. Stopping auto.`);
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
        const mineImageDiv = document.querySelector(`div.mine-image[data-mine-id="${targetMineId}"]`);
        if (mineImageDiv && mineImageDiv.offsetParent !== null) {
            console.log(`[Auto Khoáng Mạch] Clicking mine image for ID ${targetMineId} to view details.`);
            setTimeout(() => {
                if (safeClick(mineImageDiv, `Mine Image (ID: ${targetMineId})`)) {
                    // Wait for the user rows to load inside the detail modal
                    waitForElementStable(`div.mine[data-mine-id="${targetMineId}"] div.user-row`, (userRow) => {
                        if (userRow) {
                            console.log('[Auto Khoáng Mạch] Mine details (user-row) loaded.');
                            nextStep();
                        } else {
                            console.warn('[Auto Khoáng Mạch] User rows not loaded after clicking mine image. Retrying cycle.');
                            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                        }
                    }, CONFIG.TIMEOUT_ELEMENT_STABLE);
                } else {
                    console.error(`[Auto Khoáng Mạch] Failed to click mine image for ID ${targetMineId}. Retrying cycle.`);
                    setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
                }
            }, CONFIG.TIMEOUT_CLICK_DELAY);
        } else {
            console.warn(`[Auto Khoáng Mạch] Mine image for ID ${targetMineId} not found to click details. Retrying cycle.`);
            setNextCycleTimer(CONFIG.TIMEOUT_RETRY_NO_DATA);
        }
    }

    /**
     * Kiểm tra xem đang ở trong giao diện chi tiết mỏ đã chọn hay không.
     * @param {string} targetMineId - ID của mỏ.
     * @param {function(boolean): void} callback - Callback với true nếu đang ở trong mỏ chi tiết, false nếu không.
     */
    function checkInsideSelectedMineDetails(targetMineId, callback) {
        waitForElementStable(`button.leave-mine[data-mine-id="${targetMineId}"]`, (leaveButton) => {
            if (leaveButton) {
                // If leave button exists, we are on the mine detail page.
                // Now, ensure the inner details (user-row) are also loaded.
                waitForElementStable(`div.mine[data-mine-id="${targetMineId}"] div.user-row`, (userRow) => {
                    if (userRow) {
                        console.log(`[Auto Khoáng Mạch] Confirmed in mine detail view for ID ${targetMineId}.`);
                        callback(true);
                    } else {
                        console.warn(`[Auto Khoáng Mạch] On mine detail page ID ${targetMineId}, but user-row not loaded.`);
                        callback(false);
                    }
                }, 7000); // 7s for user-row
            } else {
                console.log(`[Auto Khoáng Mạch] Not in mine detail view for ID ${targetMineId}.`);
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
            console.log('[Auto Khoáng Mạch] Auto stopped. Ending mining cycle.');
            return;
        }
        if (currentTimerId) {
            clearTimeout(currentTimerId);
            currentTimerId = null;
        }
        console.log('--- [Auto Khoáng Mạch] Starting new mining cycle. ---');

        const targetMineInfo = MINING_LOCATIONS_MAP.get(selectedMineId);
        if (!targetMineInfo) {
            console.error(`[Auto Khoáng Mạch] ERROR: Mine ID ${selectedMineId} not found. Stopping auto.`);
            stopAuto();
            return;
        }

        // 1. Ensure correct mine type is selected
        switchMineType(targetMineInfo.type, () => {
            // 2. Check if we are already inside the target mine's detail view (modal)
            checkInsideSelectedMineDetails(selectedMineId, (isInsideDetails) => {
                if (isInsideDetails) {
                    console.log(`[Auto Khoáng Mạch] Already inside mine ID ${selectedMineId} details. Processing player row.`);
                    processPlayerMineRow(); // This function will schedule the next cycle
                } else {
                    // Not inside details. Need to navigate or open modal.
                    const enterButtonOnPage = document.querySelector(`button.enter-mine[data-mine-id="${selectedMineId}"]`);
                    const leaveButtonOnPage = document.querySelector(`button.leave-mine[data-mine-id="${selectedMineId}"]`);

                    if (enterButtonOnPage && enterButtonOnPage.offsetParent !== null && !enterButtonOnPage.disabled) {
                        console.log(`[Auto Khoáng Mạch] Found "Vào Ngay" button for ID ${selectedMineId} on current page. Entering mine.`);
                        navigateAndEnterMine(selectedMineId, () => {
                            // After entering the mine detail page (has leave button), click the mine image to open the modal
                            console.log(`[Auto Khoáng Mạch] Entered mine detail page. Clicking mine image to open details modal.`);
                            clickMineImageForDetails(selectedMineId, () => {
                                // Once modal is open and loaded, process the player row.
                                console.log('[Auto Khoáng Mạch] Mine details modal loaded. Processing player row.');
                                processPlayerMineRow();
                            });
                        });
                    } else if (leaveButtonOnPage && leaveButtonOnPage.offsetParent !== null && !leaveButtonOnPage.disabled) {
                        // Already on the mine detail page, but modal might not be open or loaded. Click image to force it.
                        console.log(`[Auto Khoáng Mạch] On mine detail page ID ${selectedMineId} (has "Rời Khỏi" button), but not in details view. Clicking mine image.`);
                        clickMineImageForDetails(selectedMineId, () => {
                            console.log('[Auto Khoáng Mạch] Mine details modal loaded. Processing player row.');
                            processPlayerMineRow();
                        });
                    } else {
                        // Not on the correct page to enter the mine directly. Need to navigate pages.
                        console.log(`[Auto Khoáng Mạch] "Vào Ngay" button for ID ${selectedMineId} not found. Navigating pages to find it.`);
                        navigateAndEnterMine(selectedMineId, () => {
                            // navigateAndEnterMine will handle page switching and entering the mine detail page.
                            // After it's done, it will call startMiningCycle again to initiate clickMineImageForDetails.
                            console.log(`[Auto Khoáng Mạch] Navigation complete. Re-triggering cycle to open mine details.`);
                            setNextCycleTimer(CONFIG.TIMEOUT_PAGE_NAV_WAIT);
                        });
                    }
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
        const startButton = document.querySelector('#startButton');
        const stopButton = document.querySelector('#stopButton');
        if (startButton) {
            startButton.textContent = 'Bắt đầu Auto';
            startButton.disabled = false;
        }
        if (stopButton) {
            stopButton.disabled = true;
        }
        console.log('[Auto Khoáng Mạch] Auto stopped.');
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
            console.log('[Auto Khoáng Mạch] Auto started.');
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
                background: rgba(40, 44, 52, 0.9);
                color: white;
                padding: 10px 15px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
                font-family: 'Segoe UI', Arial, sans-serif;
                font-size: 14px;
                z-index: 9999;
                border: 1px solid #555;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                margin-top: 15px;
                margin-bottom: 20px;
                width: fit-content;
                max-width: 300px;
                margin-left: auto;
                margin-right: auto;
            }
            #autoMineConfig .config-group {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 5px;
                width: 100%;
            }
            #autoMineConfig .config-group.checkbox-group {
                flex-direction: row;
                justify-content: center;
                gap: 10px;
            }
            #autoMineConfig label {
                font-weight: bold;
                color: #ADD8E6;
                white-space: nowrap;
                margin-bottom: 3px;
            }
            #autoMineConfig select, #autoMineConfig button {
                background: #333;
                color: white;
                border: 1px solid #666;
                border-radius: 5px;
                padding: 5px 10px;
                cursor: pointer;
                width: 100%;
                box-sizing: border-box;
            }
            #autoMineConfig select:focus, #autoMineConfig button:focus {
                outline: none;
                border-color: #7BC0E3;
                box-shadow: 0 0 0 2px rgba(123, 192, 227, 0.3);
            }
            #autoMineConfig button {
                font-weight: bold;
                transition: background-color 0.2s, transform 0.1s;
            }
            #autoMineConfig button.start-button {
                background-color: #28a745;
            }
            #autoMineConfig button.start-button:hover {
                background-color: #218838;
                transform: translateY(-1px);
            }
            #autoMineConfig button.stop-button {
                background-color: #dc3545;
            }
            #autoMineConfig button.stop-button:hover {
                background-color: #c82333;
                transform: translateY(-1px);
            }
            #autoMineConfig input[type="checkbox"] {
                margin: 0;
                width: auto;
                cursor: pointer;
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
                        <option value="50%">Thưởng thêm >= 50%</option>
                        <option value="20%">Thưởng thêm >= 20%</option>
                        <option value="0%">Thưởng thêm > 0%</option>
                        <option value="any">Bất kỳ (Đạt tối đa)</option>
                    </select>
                </div>
                <div class="config-group checkbox-group">
                    <input type="checkbox" id="autoStartCheckbox">
                    <label for="autoStartCheckbox">Tự động hoàn toàn khi tải trang</label>
                </div>
                <button id="startButton" class="start-button">Bắt đầu Auto</button>
                <button id="stopButton" class="stop-button">Dừng Auto</button>
            `;
            targetDiv.parentNode.insertBefore(configDiv, targetDiv.nextSibling);

            const specificMineSelect = configDiv.querySelector('#specificMineSelect');
            const rewardModeSelect = configDiv.querySelector('#rewardModeSelect');
            const autoStartCheckbox = configDiv.querySelector('#autoStartCheckbox');
            const startButton = configDiv.querySelector('#startButton');
            const stopButton = configDiv.querySelector('#stopButton');

            specificMineSelect.value = selectedMineId;
            rewardModeSelect.value = selectedRewardMode;
            autoStartCheckbox.checked = autoStartEnabled;

            specificMineSelect.addEventListener('change', (event) => {
                selectedMineId = event.target.value;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'id', selectedMineId);
                console.log(`[Auto Khoáng Mạch] Selected mine ID: ${selectedMineId}`);
            });

            rewardModeSelect.addEventListener('change', (event) => {
                selectedRewardMode = event.target.value;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'reward_mode', selectedRewardMode);
                console.log(`[Auto Khoáng Mạch] Selected reward mode: ${selectedRewardMode}`);
            });

            autoStartCheckbox.addEventListener('change', (event) => {
                autoStartEnabled = event.target.checked;
                localStorage.setItem(CONFIG.LOCAL_STORAGE_PREFIX + 'auto_start', autoStartEnabled);
                console.log(`[Auto Khoáng Mạch] Auto start on load: ${autoStartEnabled}`);
            });

            startButton.addEventListener('click', startAuto);
            stopButton.addEventListener('click', stopAuto);

            // Set initial button states
            if (isAutoRunning) {
                startButton.textContent = 'Đang chạy...';
                startButton.disabled = true;
                stopButton.disabled = false;
            } else {
                stopButton.disabled = true;
            }

            isUIMade = true;
            console.log('[Auto Khoáng Mạch] UI created.');

            if (uiObserver) {
                uiObserver.disconnect();
                console.log('[Auto Khoáng Mạch] UI creation observer disconnected.');
            }

            // If autoStart is enabled, start the auto process immediately
            if (autoStartEnabled) {
                console.log('[Auto Khoáng Mạch] Auto start enabled. Starting auto.');
                startAuto();
            }
        }, CONFIG.TIMEOUT_ELEMENT_STABLE); // Max 15 seconds to find mine-buttons
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
