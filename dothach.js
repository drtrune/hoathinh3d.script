// ==UserScript==
// @name         HH3D Đổ thạch
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      1.6
// @description  Tự động đặt cược vào đá có tỷ lệ thưởng cao nhất trên HoatHinh3D
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/do-thach-hh3d*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Auto Bet - DEBUG] Script tải thành công. Thời gian hiện tại:', new Date().toLocaleTimeString());

    // --- Cấu hình ---
    const BET_AMOUNT = 20; // Số lượng cược mong muốn
    const MAIN_CHECK_INTERVAL = 4000; // Mỗi 4 giây kiểm tra lại
    const INTER_ACTION_DELAY = 1000; // 1 giây chờ giữa các thao tác
    const MAX_BETS_PER_ROUND = 2; // Số lần đặt cược tối đa trong một vòng chơi (lượt đổ thạch)

    // --- Biến cờ trạng thái ---
    let betsMadeInCurrentRound = 0; // Số lần đã đặt cược thành công trong lượt hiện tại
    let isBettingProcessActive = false; // Cờ để đảm bảo quá trình đặt cược chỉ chạy một lần tại một thời điểm
    let intervalId = null; // ID của setInterval để có thể dừng nó

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

    // --- Logic đặt cược ---
    async function performBetting() {
        if (isBettingProcessActive) {
            console.log('[Auto Bet - DEBUG] performBetting: Tiến trình đặt cược đã hoặc đang chạy (isBettingProcessActive = true). Bỏ qua lần này.');
            return;
        }

        if (betsMadeInCurrentRound >= MAX_BETS_PER_ROUND) {
            console.log(`%c[Auto Bet - DEBUG] performBetting: Đã đạt số lần cược tối đa (${MAX_BETS_PER_ROUND}). Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting(); // Dừng script khi đạt giới hạn cược
            return;
        }

        // Kiểm tra sự xuất hiện của nút "Đạt giới hạn"
        const limitReachedButtons = document.querySelectorAll('.limit-reached');
        if (limitReachedButtons.length > 0) {
            console.log(`%c[Auto Bet - DEBUG] performBetting: Phát hiện nút "Đạt giới hạn". Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting(); // Dừng script khi phát hiện nút "Đạt giới hạn"
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
            const betPlacedButton = stoneItem.querySelector('.bet-placed'); // Nút "Đã đặt cược"
            // Không cần kiểm tra limitReachedButton ở đây vì đã kiểm tra ở đầu hàm performBetting
            const rewardMultiplierSpan = stoneItem.querySelector('.reward-multiplier span');
            const stoneName = stoneItem.querySelector('.class-name-stone')?.textContent || 'Unknown Stone';

            console.log(`[Auto Bet - DEBUG] performBetting: Đang kiểm tra đá #${index + 1}: ${stoneName}.`);
            console.log(`[Auto Bet - DEBUG]   - Nút chọn (.select-stone-button): ${selectButton ? 'Có' : 'Không'}, Disabled: ${selectButton ? selectButton.disabled : 'N/A'}`);
            console.log(`[Auto Bet - DEBUG]   - Nút đã đặt cược (.bet-placed): ${betPlacedButton ? 'Có' : 'Không'}`);
            console.log(`[Auto Bet - DEBUG]   - Tỷ lệ thưởng span: ${rewardMultiplierSpan ? 'Có' : 'Không'}`);

            // Điều kiện để thêm vào danh sách khả dụng:
            // 1. Phải có nút "Chọn đá" và không bị disabled.
            // 2. KHÔNG được có nút "Đã đặt cược" (nghĩa là chưa cược viên này).
            // 3. Phải có tỷ lệ thưởng.
            if (selectButton && !selectButton.disabled && !betPlacedButton && rewardMultiplierSpan) {
                const multiplier = parseInt(rewardMultiplierSpan.textContent.replace('x', ''), 10);
                if (!isNaN(multiplier)) {
                    availableStones.push({
                        element: stoneItem,
                        button: selectButton,
                        name: stoneName,
                        multiplier: multiplier
                    });
                    console.log(`[Auto Bet - DEBUG]   -> Đá ${stoneName} (x${multiplier}) được thêm vào danh sách khả dụng.`);
                } else {
                    console.warn(`[Auto Bet - DEBUG]   -> CẢNH BÁO: Tỷ lệ thưởng của ${stoneName} không phải là số hợp lệ.`);
                }
            } else {
                console.log(`[Auto Bet - DEBUG]   -> Đá ${stoneName} không khả dụng để chọn (đã cược, hoặc thiếu thông tin).`);
            }
        });

        console.log(`[Auto Bet - DEBUG] performBetting: Tổng số đá khả dụng sau lọc: ${availableStones.length}.`);

        // Sắp xếp các viên đá theo tỷ lệ thưởng giảm dần
        availableStones.sort((a, b) => b.multiplier - a.multiplier);
        console.log('[Auto Bet - DEBUG] performBetting: Các đá khả dụng (sau sắp xếp):', availableStones.map(s => `${s.name} (x${s.multiplier})`));

        if (availableStones.length === 0) {
            console.log('[Auto Bet - DEBUG] performBetting: Không còn đá nào khả dụng để đặt cược trong vòng này. Đã đặt cược:', betsMadeInCurrentRound);
            return;
        }

        // Chọn viên đá có tỷ lệ cao nhất
        const bestStoneToBet = availableStones[0];
        console.log(`[Auto Bet - DEBUG] performBetting: Chọn đá có tỷ lệ cao nhất để cược: ${bestStoneToBet.name} (x${bestStoneToBet.multiplier}).`);

        isBettingProcessActive = true;
        console.log(`[Auto Bet - DEBUG] performBetting: Đặt cờ isBettingProcessActive = true.`);

        console.log(`[Auto Bet - DEBUG] performBetting: Đang nhấp nút "Chọn Đá" cho ${bestStoneToBet.name}.`);
        if (!safeClick(bestStoneToBet.button, `nút "Chọn Đá" cho ${bestStoneToBet.name}`)) {
            console.warn('[Auto Bet - DEBUG] performBetting: Không thể nhấp nút "Chọn Đá". Dừng quá trình đặt cược.');
            isBettingProcessActive = false;
            return;
        }

        await sleep(INTER_ACTION_DELAY); // Chờ hộp thoại cược hiện lên

        // Tìm input nhập số lượng cược
        console.log('[Auto Bet - DEBUG] performBetting: Đang chờ input số lượng cược (#bet-amount).');
        const betAmountInput = await waitForElementSimple('input[type="number"]#bet-amount', 5000, 200, 'input số lượng cược');
        if (!betAmountInput) {
            console.warn('[Auto Bet - DEBUG] performBetting: KHÔNG tìm thấy input số lượng cược sau khi chờ. Dừng quá trình đặt cược.');
            isBettingProcessActive = false;
            return;
        }

        console.log(`[Auto Bet - DEBUG] performBetting: Đã tìm thấy input số lượng cược. Giá trị hiện tại: ${betAmountInput.value}. Đang điền ${BET_AMOUNT}...`);
        betAmountInput.value = BET_AMOUNT;
        betAmountInput.dispatchEvent(new Event('input', { bubbles: true })); // Kích hoạt sự kiện input
        betAmountInput.dispatchEvent(new Event('change', { bubbles: true })); // Kích hoạt sự kiện change
        console.log(`[Auto Bet - DEBUG] performBetting: Đã điền giá trị ${BET_AMOUNT} vào input và kích hoạt sự kiện.`);

        await sleep(INTER_ACTION_DELAY); // Chờ sau khi điền số

        // Tìm nút xác nhận cược
        console.log('[Auto Bet - DEBUG] performBetting: Đang chờ nút "Xác nhận" cược (#confirm-bet).');
        const confirmBetButton = await waitForElementSimple('button#confirm-bet', 5000, 200, 'nút "Xác nhận" cược');
        if (!confirmBetButton) {
            console.warn('[Auto Bet - DEBUG] performBetting: KHÔNG tìm thấy nút "Xác nhận" cược sau khi chờ. Dừng quá trình đặt cược.');
            isBettingProcessActive = false;
            return;
        }

        console.log('[Auto Bet - DEBUG] performBetting: Đã tìm thấy nút "Xác nhận". Đang nhấp...');
        if (!safeClick(confirmBetButton, 'nút "Xác nhận" cược')) {
            console.warn('[Auto Bet - DEBUG] performBetting: KHÔNG thể nhấp nút "Xác nhận" cược. Dừng quá trình đặt cược.');
            isBettingProcessActive = false;
            return;
        }

        console.log(`%c[Auto Bet - DEBUG] ĐÃ ĐẶT CƯỢC ${BET_AMOUNT} VÀO ${bestStoneToBet.name} THÀNH CÔNG!`, 'color: green; font-weight: bold;');
        betsMadeInCurrentRound++;
        isBettingProcessActive = false;
        console.log(`[Auto Bet - DEBUG] performBetting: Đặt cờ isBettingProcessActive = false. betsMadeInCurrentRound = ${betsMadeInCurrentRound}.`);
    }

    // --- Hàm để kiểm tra trạng thái dừng script ---
    function checkStopConditions() {
        // Kiểm tra nếu đã cược đủ số lần
        if (betsMadeInCurrentRound >= MAX_BETS_PER_ROUND) {
            console.log(`%c[Auto Bet - DEBUG] checkStopConditions: Đã đạt số lần cược tối đa (${MAX_BETS_PER_ROUND}). Dừng script.`, 'color: orange; font-weight: bold;');
            stopAutoBetting();
            return true;
        }

        // Kiểm tra sự xuất hiện của nút "Đạt giới hạn"
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

    // --- Vòng lặp kiểm tra chính ---
    async function mainLoopCheck() {
        console.log(`[Auto Bet - DEBUG] --- Bắt đầu Main loop check: ${new Date().toLocaleTimeString()} ---`);

        // Luôn kiểm tra điều kiện dừng trước tiên
        if (checkStopConditions()) {
            console.log('[Auto Bet - DEBUG] mainLoopCheck: Điều kiện dừng đã được đáp ứng. Bỏ qua cược.');
            console.log(`[Auto Bet - DEBUG] --- Kết thúc Main loop check ---`);
            return;
        }

        console.log(`[Auto Bet - DEBUG] Main loop status: BettingActive: ${isBettingProcessActive}, Bets Made (Current Round): ${betsMadeInCurrentRound}/${MAX_BETS_PER_ROUND}`);

        // Nếu chưa đạt số lần cược tối đa và không có quá trình cược nào đang diễn ra, thì tiến hành cược
        if (betsMadeInCurrentRound < MAX_BETS_PER_ROUND && !isBettingProcessActive) {
            console.log(`[Auto Bet - DEBUG] mainLoopCheck: Điều kiện cược được đáp ứng. Gọi performBetting().`);
            await performBetting(); // Dùng await để đảm bảo performBetting hoàn tất trước khi vòng lặp tiếp tục
        } else {
            console.log('[Auto Bet - DEBUG] mainLoopCheck: Đang chờ đợi hoặc một quá trình cược đang diễn ra.');
        }
        console.log(`[Auto Bet - DEBUG] --- Kết thúc Main loop check ---`);
    }

    // --- Khởi tạo và chạy vòng lặp chính ---
    function startMainLoop() {
        if (intervalId === null) {
            console.log('[Auto Bet - DEBUG] Khởi động vòng lặp kiểm tra chính.');
            mainLoopCheck(); // Chạy lần đầu ngay lập tức
            intervalId = setInterval(mainLoopCheck, MAIN_CHECK_INTERVAL);
            console.log(`[Auto Bet - DEBUG] Vòng lặp chính được thiết lập với intervalId: ${intervalId}, chạy mỗi ${MAIN_CHECK_INTERVAL}ms.`);
        } else {
            console.log('[Auto Bet - DEBUG] Vòng lặp kiểm tra chính đã chạy rồi (intervalId không null).');
        }
    }

    // Đảm bảo script khởi động sau khi DOM đã tải đầy đủ
    window.addEventListener('DOMContentLoaded', () => {
        console.log('[Auto Bet - DEBUG] DOMContentLoaded fired.');
        startMainLoop();
    });
    window.addEventListener('load', () => {
        console.log('[Auto Bet - DEBUG] window.load fired.');
        startMainLoop(); // Phòng trường hợp DOMContentLoaded không đủ
    });

    // Xuất hàm dừng script ra global scope để có thể gọi từ console
    window.stopAutoBetting = stopAutoBetting;
    console.log('[Auto Bet - DEBUG] Hàm stopAutoBetting() có sẵn trong console (window.stopAutoBetting).');

})();
