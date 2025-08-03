// ==UserScript==
// @name         HH3D Điểm danh
// @namespace    https://github.com/drtrune/hoathinh3d.script
// @version      2.8
// @description  Tự động nhấp nút "Điểm Danh"  
// @author       Dr. Trune
// @match        https://hoathinh3d.gg/diem-danh*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Lưu các hàm console gốc ngay khi script được parse
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    originalConsoleLog('[Auto Diem Danh DEBUG] SCRIPT ĐÃ KHỞI TẠO. Bắt đầu vòng lặp kiểm tra chính...');

    // --- Cấu hình ---
    const MAIN_CHECK_INTERVAL = 500;
    const INTER_ACTION_DELAY = 300;

    // --- Biến cờ trạng thái ---
    let intervalId = null; // ID của setInterval chính
    let isClickingProcessActive = false; // Cờ để đảm bảo quá trình click chỉ chạy một lần

    // --- Hàm tiện ích: sleep ---
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- Hàm tiện ích: safeClick (từ Tiên Duyên) ---
    function safeClick(element, elementName = 'phần tử') {
        if (!element) {
            originalConsoleError(`[Auto Diem Danh DEBUG] LỖI: Không thể click vì ${elementName} là null.`);
            return false;
        }
        // Thêm kiểm tra điều kiện hiển thị và bật trước khi click cuối cùng
        const isVisible = element.offsetParent !== null;
        const isEnabled = !element.disabled && !element.classList.contains('disabled');
        // Đối với nút điểm danh, class 'flambutt-on' là quan trọng
        const hasFlambuttOn = element.classList.contains('flambutt-on');

        if (!isVisible || !isEnabled || !hasFlambuttOn) {
            originalConsoleWarn(`[Auto Diem Danh DEBUG] CẢNH BÁO: ${elementName} KHÔNG ĐỦ ĐIỀU KIỆN ĐỂ CLICK (Hiển thị: ${isVisible}, Bật: ${isEnabled}, Flambutt-on: ${hasFlambuttOn}).`);
            return false;
        }

        try {
            originalConsoleLog(`[Auto Diem Danh DEBUG] Đang thử click ${elementName} bằng dispatchEvent.`);
            const mouseEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(mouseEvent);
            originalConsoleLog(`%c[Auto Diem Danh DEBUG] Đã dispatch MouseEvent 'click' thành công cho ${elementName}.`, 'color: lightgreen;');
            return true;
        } catch (e) {
            originalConsoleWarn(`[Auto Diem Danh DEBUG] LỖI khi dispatch MouseEvent cho ${elementName}:`, e, "Thử cách click trực tiếp.");
            try {
                element.click();
                originalConsoleLog(`%c[Auto Diem Danh DEBUG] Đã click trực tiếp ${elementName} thành công.`, 'color: lightgreen;');
                return true;
            } catch (e2) {
                originalConsoleError(`%c[Auto Diem Danh DEBUG] LỖI KHÔNG THỂ CLICK ${elementName} (cả 2 cách):`, 'color: red;', e2);
                return false;
            }
        }
    }

    // --- Quản lý tùy chọn bật/tắt tự động điểm danh ---
    const AUTO_CHECKIN_TOGGLE_KEY = 'hh3dAutoCheckinEnabled';

    function getAutoCheckinState() {
        const storedState = localStorage.getItem(AUTO_CHECKIN_TOGGLE_KEY);
        return storedState === null ? true : JSON.parse(storedState);
    }

    function setAutoCheckinState(enabled) {
        localStorage.setItem(AUTO_CHECKIN_TOGGLE_KEY, JSON.stringify(enabled));
        originalConsoleLog(`[Auto Diem Danh DEBUG] Tự động điểm danh đã được ${enabled ? 'BẬT' : 'TẮT'}.`);
        // Cập nhật trạng thái của switch ngay lập tức nếu UI đã tồn tại
        const toggleSwitch = document.getElementById('autoCheckinToggleSwitch');
        if (toggleSwitch) {
            toggleSwitch.checked = enabled;
        }
    }

    // --- Hàm tạo và chèn toggle UI (chèn ngay lập tức hoặc khi có #settingsBtn) ---
    function createPersistentToggleButtonUI() {
        const toggleContainerId = 'autoDiemDanhToggleContainer';
        let toggleContainer = document.getElementById(toggleContainerId);

        if (toggleContainer) {
            originalConsoleLog('[Auto Diem Danh DEBUG] UI toggle đã tồn tại, không tạo lại.');
            const toggleSwitch = document.getElementById('autoCheckinToggleSwitch');
            if (toggleSwitch) {
                toggleSwitch.checked = getAutoCheckinState(); // Cập nhật trạng thái
            }
            return;
        }

        const targetElement = document.querySelector('#settingsBtn.settings-button');
        if (!targetElement) {
            originalConsoleLog('[Auto Diem Danh DEBUG] Chưa tìm thấy #settingsBtn.settings-button để chèn UI toggle. Đợi vòng lặp tiếp theo.');
            return;
        }

        originalConsoleLog('[Auto Diem Danh DEBUG] Đã tìm thấy #settingsBtn.settings-button. Đang tạo và chèn UI toggle.');

        toggleContainer = document.createElement('div');
        toggleContainer.id = toggleContainerId;
        Object.assign(toggleContainer.style, {
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #00ff00',
            borderRadius: '5px',
            padding: '8px 12px',
            marginTop: '15px',
            marginBottom: '15px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            color: '#fff',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            width: 'fit-content',
            margin: '15px auto'
        });

        const label = document.createElement('span');
        label.textContent = 'Tự động điểm danh khi tải trang';
        label.style.color = '#fff';
        toggleContainer.appendChild(label);

        const toggleSwitch = document.createElement('input');
        toggleSwitch.type = 'checkbox';
        toggleSwitch.id = 'autoCheckinToggleSwitch';
        toggleSwitch.checked = getAutoCheckinState(); // Lấy trạng thái từ localStorage

        Object.assign(toggleSwitch.style, {
            width: '22px',
            height: '22px',
            cursor: 'pointer',
            verticalAlign: 'middle'
        });

        toggleSwitch.addEventListener('change', (event) => {
            setAutoCheckinState(event.target.checked);
        });
        toggleContainer.appendChild(toggleSwitch);

        targetElement.after(toggleContainer);
        originalConsoleLog('[Auto Diem Danh DEBUG] UI toggle đã được chèn thành công.');
    }

    // --- Hàm dừng script chính ---
    function stopAutoDiemDanh() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
            originalConsoleLog('%c[Auto Diem Danh DEBUG] SCRIPT ĐÃ DỪNG: Nhiệm vụ hoàn thành hoặc được dừng thủ công.', 'color: #1a73e8; font-weight: bold;');
        } else {
            originalConsoleLog('[Auto Diem Danh DEBUG] Script đã dừng rồi.');
        }
    }

    // --- Hàm kiểm tra trạng thái điểm danh và thực hiện click ---
    async function checkAndClickDiemDanh() {
        if (isClickingProcessActive) {
            originalConsoleLog('[Auto Diem Danh DEBUG] Tiến trình click điểm danh đang hoạt động. Bỏ qua.');
            return;
        }

        if (!getAutoCheckinState()) {
            originalConsoleLog('[Auto Diem Danh DEBUG] Tự động điểm danh bị TẮT theo tùy chọn người dùng. Bỏ qua click.');
            return;
        }

        const button = document.querySelector('#checkInButton.flambutt-on');
        if (button) {
            // Nút có class 'flambutt-on' và tồn tại
            const isVisible = button.offsetParent !== null;
            const isEnabled = !button.disabled && !button.classList.contains('disabled');

            if (isVisible && isEnabled) {
                originalConsoleLog('[Auto Diem Danh DEBUG] Nút "Điểm Danh" sẵn sàng để click. Bắt đầu tiến trình click.');
                isClickingProcessActive = true;
                await sleep(INTER_ACTION_DELAY); // Đợi 1 giây trước khi click

                if (safeClick(button, 'nút "Điểm Danh"')) {
                    originalConsoleLog('%c[Auto Diem Danh DEBUG] ĐÃ NHẤP NÚT "Điểm Danh" THÀNH CÔNG! Dừng script.', 'color: purple; font-weight: bold;');
                    stopAutoDiemDanh();
                } else {
                    originalConsoleWarn('[Auto Diem Danh DEBUG] Không thể nhấp nút "Điểm Danh" mặc dù đã tìm thấy. Dừng script.');
                    stopAutoDiemDanh(); // Dừng script nếu không click được
                }
            } else {
                originalConsoleLog(`[Auto Diem Danh DEBUG] Nút "Điểm Danh" chưa sẵn sàng (Hiển thị: ${isVisible}, Bật: ${isEnabled}). Tiếp tục chờ.`);
            }
        } else {
            // Nút không có class 'flambutt-on', kiểm tra xem có phải đã điểm danh rồi không
            const checkinMessageElement = document.querySelector('.form-input.status'); // Tìm element hiển thị trạng thái điểm danh
            if (checkinMessageElement && checkinMessageElement.textContent.includes('Đã điểm danh hôm nay')) {
                 originalConsoleLog('%c[Auto Diem Danh DEBUG] Đã phát hiện thông báo "Đã điểm danh hôm nay". Dừng script.', 'color: green; font-weight: bold;');
                 stopAutoDiemDanh();
            } else {
                 originalConsoleLog('[Auto Diem Danh DEBUG] Nút "Điểm Danh" chưa hiển thị hoặc chưa có class "flambutt-on", và chưa có thông báo "Đã điểm danh".');
            }
        }
    }

    // --- Vòng lặp chính của script (tương tự mainLoopCheck của Tiên Duyên) ---
    async function mainLoop() {
        originalConsoleLog(`[Auto Diem Danh DEBUG] Main loop check: ${new Date().toLocaleTimeString()}`);
        createPersistentToggleButtonUI(); // Đảm bảo UI luôn được tạo/cập nhật
        await checkAndClickDiemDanh();   // Kiểm tra và thực hiện click
    }

    // --- Khởi động vòng lặp chính ---
    function startMainLoop() {
        if (intervalId === null) {
            originalConsoleLog('[Auto Diem Danh DEBUG] Khởi động vòng lặp kiểm tra chính.');
            mainLoop(); // Chạy lần đầu tiên ngay lập tức
            intervalId = setInterval(mainLoop, MAIN_CHECK_INTERVAL);
        } else {
            originalConsoleLog('[Auto Diem Danh DEBUG] Vòng lặp kiểm tra chính đã chạy rồi.');
        }
    }

    // Khởi động vòng lặp bằng nhiều cách để đảm bảo nó chạy
    startMainLoop(); // Chạy ngay lập tức

    window.addEventListener('DOMContentLoaded', () => {
        originalConsoleLog('[Auto Diem Danh DEBUG] DOMContentLoaded đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        startMainLoop();
    });

    window.addEventListener('load', () => {
        originalConsoleLog('[Auto Diem Danh DEBUG] window.load đã kích hoạt. Kiểm tra lại khởi động vòng lặp.');
        startMainLoop();
    });

    // Để có thể dừng từ console
    window.stopAutoDiemDanhScript = stopAutoDiemDanh;

})();
