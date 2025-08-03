// ==UserScript==
// @name         HH3D Đổ thạch
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      1.8
// @description  Tự động đặt cược vào đá có tỷ lệ thưởng cao nhất trên HoatHinh3D
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/do-thach-hh3d*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Bet - DEBUG] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Cấu hình ---
    const BET_AMOUNT = 20;
    const MAIN_CHECK_INTERVAL = 4000;
    const INTER_ACTION_DELAY = 1000;
    const MAX_BETS_PER_ROUND = 2;

    // --- Quản lý tùy chọn bật/tắt tự động đặt cược ---
    const AUTO_BET_TOGGLE_KEY = 'hh3dAutoBetEnabled';

    function getAutoBetState() {
        const storedState = localStorage.getItem(AUTO_BET_TOGGLE_KEY);
        return storedState === null ? true : JSON.parse(storedState);
    }

    function setAutoBetState(enabled) {
        localStorage.setItem(AUTO_BET_TOGGLE_KEY, JSON.stringify(enabled));
        console.log(`[Auto Bet - DEBUG] Tự động đặt cược đã được ${enabled ? 'BẬT' : 'TẮT'}.`);
    }

    // --- Biến cờ trạng thái ---
    let betsMadeInCurrentRound = 0;
    let isBettingProcessActive = false;
    let intervalId = null;

    // --- Hàm tiện ích: sleep ---
    function sleep(ms) {
        console.log(`[Auto Bet - DEBUG] Đang chờ ${ms}ms...`);
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Hàm tiện ích: safeClick ---
    function safeClick(element, elementName = 'phần tử') {
        console.log(`[Auto Bet - DEBUG] safeClick: Đang kiểm tra ${elementName}. Phần tử:`, element);
        if (!element) {
            console.error(`[Auto Bet - DEBUG] LỖI: Không thể click vì ${elementName} là null.`);
            return false;
        }
        if (element.disabled) {
            console.warn(`[Auto Bet - DEBUG] CẢNH BÁO: ${elementName} bị disabled, không thể click. Thuộc tính disabled: ${element.disabled}`);
            return false;
        }
        if (element.offsetParent === null) {
            console.warn(`[Auto Bet - DEBUG] CẢNH BÁO: ${elementName} không hiển thị (offsetParent là null), không thể click.`);
            return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || rect.x < 0 || rect.y < 0) {
            console.warn(`[Auto Bet - DEBUG] CẢNH BÁO: ${elementName} có kích thước 0 hoặc ngoài màn hình (${rect.width}x${rect.height} tại ${rect.x},${rect.y}), không thể click.`);
            return false;
        }

        try {
            console.log(`[Auto Bet - DEBUG] Đang thử click ${elementName} bằng dispatchEvent (MouseEvent).`);
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            const clickSuccess = element.dispatchEvent(mouseEvent);
            console.log(`[Auto Bet - DEBUG] dispatchEvent('click') cho ${elementName} thành công: ${clickSuccess}.`);
            return clickSuccess;
        } catch (e) {
            console.warn(`[Auto Bet - DEBUG] LỖI khi dispatch MouseEvent cho ${elementName}:`, e, "Thử cách click trực tiếp.");
            try {
                element.click();
                console.log(`[Auto Bet - DEBUG] Đã click trực tiếp ${elementName} thành công.`);
                return true;
            } catch (e2) {
                console.error(`[Auto Bet - DEBUG] LỖI KHÔNG THỂ CLICK ${elementName} (cả 2 cách):`, e2);
                return false;
            }
        }
    }

    // --- Hàm tiện ích: waitForElementSimple ---
    async function waitForElementSimple(selector, timeout = 5000, interval = 200, elementName = selector) {
        let startTime = Date.now();
        console.log(`[Auto Bet - DEBUG] waitForElementSimple: Đang chờ ${elementName} (${selector}) trong ${timeout}ms.`);
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
                console.log(`[Auto Bet - DEBUG] waitForElementSimple: Tìm thấy phần tử ${elementName} trong DOM. Kiểm tra hiển thị/trạng thái.`);
                if (element.offsetParent !== null) {
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden') {
                        console.log(`[Auto Bet - DEBUG] waitForElementSimple: Phần tử ${elementName} ẩn bằng CSS.`);
                    } else if (!element.disabled || typeof element.disabled === 'undefined') {
                        console.log(`[Auto Bet - DEBUG] waitForElementSimple: Phần tử ${elementName} đã sẵn sàng.`);
                        return element;
                    } else {
                        console.log(`[Auto Bet - DEBUG] waitForElementSimple: Phần tử ${elementName} bị disabled. Thuộc tính disabled: ${element.disabled}`);
                    }
                } else {
                    console.log(`[Auto Bet - DEBUG] waitForElementSimple: Phần tử ${elementName} không hiển thị (offsetParent là null).`);
                }
            } else {
                console.log(`[Auto Bet - DEBUG] waitForElementSimple: Chưa tìm thấy phần tử ${elementName} trong DOM.`);
            }
            await sleep(interval);
        }
        console.warn(`[Auto Bet - DEBUG] KHÔNG tìm thấy ${elementName} (${selector}) sau ${timeout / 1000} giây.`);
        return null;
    }

    // --- Hàm kiểm tra và nhận thưởng (đã có từ trước) ---
    async function checkAndClaimReward() {
        console.log('[Auto Bet - DEBUG] Đang kiểm tra nút "Nhận Thưởng"...');
        const claimButton = document.querySelector('#claim-reward-button');
        if (claimButton) {
            console.log('[Auto Bet - DEBUG] Tìm thấy nút "Nhận Thưởng". Đang thử nhấp...');
            if (safeClick(claimButton, 'nút "Nhận Thưởng"')) {
                console.log('%c[Auto Bet - DEBUG] ĐÃ NHẬN THƯỞNG THÀNH CÔNG!', 'color: green; font-weight: bold;');
                await sleep(INTER_ACTION_DELAY);
            } else {
                console.warn('[Auto Bet - DEBUG] KHÔNG thể click nút "Nhận Thưởng".');
            }
        } else {
            console.log('[Auto Bet - DEBUG] Không tìm thấy nút "Nhận Thưởng".');
        }
    }

    // --- Logic đặt cược ---
    async function performBetting() {
        if (!getAutoBetState()) {
            console.log('[Auto Bet - DEBUG] Tự động đặt cược đang TẮT theo tùy chọn người dùng. Bỏ qua.');
            return;
        }
        if (isBettingProcessActive) {
            console.log('[Auto Bet - DEBUG] performBetting: Tiến trình đặt cược đã hoặc đang chạy (isBettingProcessActive = true). Bỏ qua lần này.');
            return;
        }
        if (betsMadeInCurrentRound >= MAX_BETS_PER_ROUND) {
            console.log(`%c[Auto Bet - DEBUG] performBetting: Đã đạt số lần cược tối đa (${MAX_BETS_PER_ROUND}). Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting();
            return;
        }
        const limitReachedButtons = document.querySelectorAll('.limit-reached');
        if (limitReachedButtons.length > 0) {
            console.log(`%c[Auto Bet - DEBUG] performBetting: Phát hiện nút "Đạt giới hạn". Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting();
            return;
        }
        const stoneItems = document.querySelectorAll('.do-thach-container .stone-item');
        console.log(`[Auto Bet - DEBUG] performBetting: Tìm thấy ${stoneItems.length} vật phẩm đá (.stone-item).`);
        if (stoneItems.length === 0) {
            console.log('[Auto Bet - DEBUG] performBetting: Không tìm thấy các vật phẩm đá. Có thể đang chờ tải hoặc không phải trang đổ thạch.');
            return;
        }
        const availableStones = [];
        stoneItems.forEach((stoneItem, index) => {
            const selectButton = stoneItem.querySelector('.select-stone-button');
            const betPlacedButton = stoneItem.querySelector('.bet-placed');
            const rewardMultiplierSpan = stoneItem.querySelector('.reward-multiplier span');
            const stoneName = stoneItem.querySelector('.class-name-stone')?.textContent || 'Unknown Stone';
            if (selectButton && !selectButton.disabled && !betPlacedButton && rewardMultiplierSpan) {
                const multiplier = parseInt(rewardMultiplierSpan.textContent.replace('x', ''), 10);
                if (!isNaN(multiplier)) {
                    availableStones.push({
                        element: stoneItem,
                        button: selectButton,
                        name: stoneName,
                        multiplier: multiplier
                    });
                    console.log(`[Auto Bet - DEBUG]   -> Đá ${stoneName} (x${multiplier}) được thêm vào danh sách khả dụng.`);
                }
            }
        });
        if (availableStones.length === 0) {
            console.log('[Auto Bet - DEBUG] performBetting: Không còn đá nào khả dụng để đặt cược trong vòng này.');
            return;
        }
        availableStones.sort((a, b) => b.multiplier - a.multiplier);
        const bestStoneToBet = availableStones[0];
        console.log(`[Auto Bet - DEBUG] performBetting: Chọn đá có tỷ lệ cao nhất để cược: ${bestStoneToBet.name} (x${bestStoneToBet.multiplier}).`);
        isBettingProcessActive = true;
        if (!safeClick(bestStoneToBet.button, `nút "Chọn Đá" cho ${bestStoneToBet.name}`)) {
            isBettingProcessActive = false;
            return;
        }
        await sleep(INTER_ACTION_DELAY);
        const betAmountInput = await waitForElementSimple('input[type="number"]#bet-amount', 5000, 200, 'input số lượng cược');
        if (!betAmountInput) {
            isBettingProcessActive = false;
            return;
        }
        betAmountInput.value = BET_AMOUNT;
        betAmountInput.dispatchEvent(new Event('input', { bubbles: true }));
        betAmountInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(INTER_ACTION_DELAY);
        const confirmBetButton = await waitForElementSimple('button#confirm-bet', 5000, 200, 'nút "Xác nhận" cược');
        if (!confirmBetButton) {
            isBettingProcessActive = false;
            return;
        }
        if (!safeClick(confirmBetButton, 'nút "Xác nhận" cược')) {
            isBettingProcessActive = false;
            return;
        }
        console.log(`%c[Auto Bet - DEBUG] ĐÃ ĐẶT CƯỢC ${BET_AMOUNT} VÀO ${bestStoneToBet.name} THÀNH CÔNG!`, 'color: green; font-weight: bold;');
        betsMadeInCurrentRound++;
        isBettingProcessActive = false;
    }

    // --- Hàm để kiểm tra trạng thái dừng script ---
    function checkStopConditions() {
        if (betsMadeInCurrentRound >= MAX_BETS_PER_ROUND) {
            console.log(`%c[Auto Bet - DEBUG] checkStopConditions: Đã đạt số lần cược tối đa (${MAX_BETS_PER_ROUND}). Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting();
            return true;
        }
        const limitReachedButtons = document.querySelectorAll('.limit-reached');
        if (limitReachedButtons.length > 0) {
            console.log(`%c[Auto Bet - DEBUG] checkStopConditions: Phát hiện nút "Đạt giới hạn". Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting();
            return true;
        }
        return false;
    }

    // --- Hàm dừng script ---
    function stopAutoBetting() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            console.log(`%c[Auto Bet - DEBUG] SCRIPT ĐÃ DỪNG: Đã hoàn thành mục tiêu cược hoặc đạt giới hạn.`, 'color: #1a73e8; font-weight: bold;');
        } else {
            console.log('[Auto Bet - DEBUG] stopAutoBetting: Script không hoạt động (intervalId là null).');
        }
    }

    // --- Hàm tạo và chèn toggle UI ---
    function createToggleButtonUI() {
        const toggleContainerId = 'autoBetToggleContainer';
        let toggleContainer = document.getElementById(toggleContainerId);
        const targetElement = document.getElementById('countdown');

        if (!targetElement || toggleContainer) {
            if (toggleContainer) {
                console.log('[Auto Bet - DEBUG] UI toggle đã tồn tại, không tạo lại.');
                const toggleSwitch = document.getElementById('autoBetToggleSwitch');
                if (toggleSwitch) {
                    toggleSwitch.checked = getAutoBetState();
                }
            }
            return;
        }

        console.log('[Auto Bet - DEBUG] Đã tìm thấy phần tử đếm ngược. Đang tạo và chèn UI toggle.');

        toggleContainer = document.createElement('div');
        toggleContainer.id = toggleContainerId;
        Object.assign(toggleContainer.style, {
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #00ff00',
            borderRadius: '5px',
            padding: '8px 12px',
            margin: '15px auto',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#fff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            width: 'fit-content'
        });

        const label = document.createElement('span');
        label.textContent = 'Tự động đặt cược';
        label.style.color = '#fff';
        toggleContainer.appendChild(label);

        const toggleSwitch = document.createElement('input');
        toggleSwitch.type = 'checkbox';
        toggleSwitch.id = 'autoBetToggleSwitch';
        toggleSwitch.checked = getAutoBetState();

        Object.assign(toggleSwitch.style, {
            width: '22px',
            height: '22px',
            cursor: 'pointer',
            verticalAlign: 'middle'
        });

        toggleSwitch.addEventListener('change', (event) => {
            setAutoBetState(event.target.checked);
        });
        toggleContainer.appendChild(toggleSwitch);

        targetElement.after(toggleContainer);
        console.log('[Auto Bet - DEBUG] UI toggle đã được chèn thành công.');
    }

    // --- Vòng lặp kiểm tra chính ---
    async function mainLoopCheck() {
        console.log(`[Auto Bet - DEBUG] --- Bắt đầu Main loop check: ${new Date().toLocaleTimeString()} ---`);

        // Luôn tạo UI và kiểm tra điều kiện dừng trước tiên
        createToggleButtonUI();
        if (checkStopConditions()) {
            console.log('[Auto Bet - DEBUG] mainLoopCheck: Điều kiện dừng đã được đáp ứng. Bỏ qua cược.');
            console.log(`[Auto Bet - DEBUG] --- Kết thúc Main loop check ---`);
            return;
        }

        console.log(`[Auto Bet - DEBUG] Main loop status: BettingActive: ${isBettingProcessActive}, Bets Made (Current Round): ${betsMadeInCurrentRound}/${MAX_BETS_PER_ROUND}`);

        // Nếu chưa đạt số lần cược tối đa và không có quá trình cược nào đang diễn ra, thì tiến hành cược
        if (getAutoBetState() && betsMadeInCurrentRound < MAX_BETS_PER_ROUND && !isBettingProcessActive) {
            console.log(`[Auto Bet - DEBUG] mainLoopCheck: Điều kiện cược được đáp ứng. Gọi performBetting().`);
            await performBetting();
        } else {
            console.log('[Auto Bet - DEBUG] mainLoopCheck: Đang chờ đợi hoặc một quá trình cược đang diễn ra.');
        }
        console.log(`[Auto Bet - DEBUG] --- Kết thúc Main loop check ---`);
    }

    // --- Khởi tạo và chạy vòng lặp chính ---
    async function startMainLoop() {
        if (intervalId === null) {
            console.log('[Auto Bet - DEBUG] Khởi động vòng lặp kiểm tra chính.');
            await checkAndClaimReward(); // Ưu tiên nhận thưởng trước

            mainLoopCheck();
            intervalId = setInterval(mainLoopCheck, MAIN_CHECK_INTERVAL);
            console.log(`[Auto Bet - DEBUG] Vòng lặp chính được thiết lập với intervalId: ${intervalId}, chạy mỗi ${MAIN_CHECK_INTERVAL}ms.`);
        } else {
            console.log('[Auto Bet - DEBUG] Vòng lặp kiểm tra chính đã chạy rồi (intervalId không null).');
        }
    }

    // Khởi động vòng lặp ngay khi script được thực thi
    startMainLoop();

    window.stopAutoBetting = stopAutoBetting;
    console.log('[Auto Bet - DEBUG] Hàm stopAutoBetting() có sẵn trong console (window.stopAutoBetting).');

})();
