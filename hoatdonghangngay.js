// ==UserScript==
// @name        HH3D Hoạt Động Hàng Ngày
// @namespace   https://github.com/drtrune/hoathinh3d.script
// @version     1.4
// @description Tự động mở rương thưởng hàng ngày, thêm nút chuyển trang Vòng Quay Phúc Vận và các nút điều hướng đến từng nhiệm vụ chưa hoàn thành.
// @author      Dr. Trune
// @match       https://hoathinh3d.gg/bang-hoat-dong-ngay*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Hoạt Động Ngày Enhancer] Script đã được tải.');

    // ===============================================
    // CẤU HÌNH & BIẾN TOÀN CỤC
    // ===============================================

    // Trạng thái ban đầu của tính năng tự động mở rương
    let autoOpenChestsActive = true;

    // Các ID của rương cần tự động mở (vẫn là ID của div chứa rương)
    const CHEST_IDS = ['reward-box-1', 'reward-box-2'];

    // Danh sách các nhiệm vụ và URL tương ứng
    // Quan trọng: Tên nhiệm vụ ở đây phải khớp với văn bản trong class 'progress-title'
    const DAILY_MISSIONS = [
        { name: 'Điểm danh', url: 'https://hoathinh3d.gg/diem-danh' },
        { name: 'Luận Võ', url: 'https://hoathinh3d.gg/luan-vo-duong' },
        { name: 'Hoang Vực', url: 'https://hoathinh3d.gg/hoang-vuc' },
        { name: 'Phúc Lợi', url: 'https://hoathinh3d.gg/phuc-loi-duong' },
        { name: 'Vấn Đáp', url: 'https://hoathinh3d.gg/van-dap-tong-mon' }
    ];

    // ===============================================
    // HÀM TIỆN ÍCH UI
    // ===============================================

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    function createCustomUI() {
        addStyle(`
            /* Container chung cho các điều khiển */
            .daily-activity-enhancer-controls {
                margin-top: 15px;
                margin-bottom: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.7);
                border-radius: 10px;
                border: 1px solid #4CAF50;
                box-shadow: 0 4px 15px rgba(0, 255, 0, 0.2);
            }

            /* Container cho nút gạt và nhãn (căn giữa) */
            .auto-open-toggle-container {
                display: flex;
                align-items: center;
                gap: 10px;
                color: #e0e0e0;
                font-size: 14px;
                user-select: none;
            }

            /* CSS cho nút gạt (toggle switch) - Giống Luận Võ */
            .switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
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
                border-radius: 24px;
            }

            .slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 4px;
                bottom: 4px;
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
                -webkit-transform: translateX(20px);
                -ms-transform: translateX(20px);
                transform: translateX(20px);
            }

            .slider.round {
                border-radius: 24px;
            }

            .slider.round:before {
                border-radius: 50%;
            }

            /* CSS cho các nút bấm */
            .action-button {
                background-color: #f44336; /* Màu đỏ cho Vòng Quay */
                color: white;
                padding: 10px 20px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 15px;
                font-weight: bold;
                transition: background-color 0.3s ease, transform 0.2s ease;
                text-decoration: none; /* Bỏ gạch chân cho thẻ a */
                text-align: center;
                display: inline-block;
                width: 250px; /* Chiều rộng cố định cho nút */
                box-sizing: border-box; /* Bao gồm padding và border trong width */
            }

            .action-button.mission-button {
                background-color: #2196F3; /* Màu xanh cho nhiệm vụ */
            }

            .action-button.all-completed {
                background-color: #4CAF50; /* Màu xanh lá cây khi hoàn thành tất cả */
                cursor: default;
            }

            .action-button:hover:not(.all-completed) {
                background-color: #d32f2f;
                transform: translateY(-2px);
            }

            .action-button.mission-button:hover:not(.all-completed) {
                background-color: #1976D2;
            }

            .action-button:active:not(.all-completed) {
                transform: translateY(0);
            }

            /* Container cho các nút nhiệm vụ */
            #missionButtonsContainer {
                display: flex;
                flex-direction: column;
                gap: 10px; /* Khoảng cách giữa các nút nhiệm vụ */
                width: 100%; /* Đảm bảo container chiếm đủ chiều rộng */
                align-items: center; /* Căn giữa các nút bên trong */
            }
        `);

        // Tìm vị trí chèn: dưới class 'fantasy-header'
        const targetElement = document.querySelector('.fantasy-header');

        if (targetElement) {
            const controlsContainer = document.createElement('div');
            controlsContainer.className = 'daily-activity-enhancer-controls';

            // --- Nút gạt "Tự động mở rương thưởng" ---
            const toggleContainer = document.createElement('div');
            toggleContainer.className = 'auto-open-toggle-container';

            const labelText = document.createElement('label');
            labelText.textContent = 'Tự động mở rương thưởng';
            labelText.htmlFor = 'autoOpenChestsToggleSwitch';

            const switchWrapper = document.createElement('label');
            switchWrapper.className = 'switch';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = 'autoOpenChestsToggleSwitch';
            checkbox.checked = autoOpenChestsActive; // Mặc định bật
            checkbox.addEventListener('change', (e) => {
                autoOpenChestsActive = e.target.checked;
                console.log(`[Hoạt Động Ngày Enhancer] Tự động mở rương thưởng: ${autoOpenChestsActive ? 'Đã BẬT' : 'Đã TẮT'}`);
                if (autoOpenChestsActive) {
                    openRewardChests(); // Gọi lại hàm mở rương khi bật
                }
            });

            const slider = document.createElement('span');
            slider.className = 'slider round';

            switchWrapper.appendChild(checkbox);
            switchWrapper.appendChild(slider);

            toggleContainer.appendChild(labelText);
            toggleContainer.appendChild(switchWrapper);
            controlsContainer.appendChild(toggleContainer);

            // --- Nút chuyển trang Vòng Quay Phúc Vận ---
            const vongQuayButton = document.createElement('a');
            vongQuayButton.href = 'https://hoathinh3d.gg/vong-quay-phuc-van';
            vongQuayButton.className = 'action-button'; // Sử dụng class chung
            vongQuayButton.textContent = 'Đi đến Vòng Quay Phúc Vận';
            vongQuayButton.target = '_blank'; // Mở trong tab mới

            controlsContainer.appendChild(vongQuayButton);

            // --- Container cho các nút nhiệm vụ ---
            const missionButtonsContainer = document.createElement('div');
            missionButtonsContainer.id = 'missionButtonsContainer';
            controlsContainer.appendChild(missionButtonsContainer);

            // Chèn controlsContainer ngay sau targetElement
            targetElement.parentNode.insertBefore(controlsContainer, targetElement.nextSibling);

            console.log('[Hoạt Động Ngày Enhancer] UI đã được chèn vào DOM.');

            // Sau khi UI được tạo, kiểm tra nhiệm vụ
            checkAndSetMissionButtons();

        } else {
            console.warn('[Hoạt Động Ngày Enhancer] Không tìm thấy phần tử .fantasy-header để chèn UI.');
        }
    }

    // ===============================================
    // HÀM XỬ LÝ CHỨC NĂNG TỰ ĐỘNG MỞ RƯƠNG
    // ===============================================

    function openRewardChests() {
        if (!autoOpenChestsActive) {
            console.log('[Hoạt Động Ngày Enhancer] Tính năng tự động mở rương đang TẮT.');
            return;
        }

        console.log('[Hoạt Động Ngày Enhancer] Đang cố gắng mở rương thưởng...');

        CHEST_IDS.forEach(id => {
            const chestElement = document.getElementById(id); // This is the div
            if (chestElement) {
                const imageElement = chestElement.querySelector('.reward-image');

                if (imageElement) {
                    // Kiểm tra nếu rương có class 'unlocked' VÀ không có class 'opened'
                    if (chestElement.classList.contains('unlocked') && !chestElement.classList.contains('opened')) {
                        try {
                            console.log(`[Hoạt Động Ngày Enhancer] Đang kích hoạt sự kiện click cho ảnh trong rương: ${id}`);
                            const clickEvent = new MouseEvent('click', {
                                view: window,
                                bubbles: true,
                                cancelable: true
                            });
                            imageElement.dispatchEvent(clickEvent);
                        } catch (e) {
                            console.error(`[Hoạt Động Ngày Enhancer] Lỗi khi kích hoạt ảnh trong rương ${id}:`, e);
                        }
                    } else if (chestElement.classList.contains('opened')) {
                        console.log(`[Hoạt Động Ngày Enhancer] Rương ${id} đã được mở.`);
                    } else if (!chestElement.classList.contains('unlocked')) {
                        console.log(`[Hoạt Động Ngày Enhancer] Rương ${id} chưa mở khóa (không có class 'unlocked').`);
                    }
                } else {
                    console.log(`[Hoạt Động Ngày Enhancer] Không tìm thấy ảnh (.reward-image) trong rương với ID: ${id}`);
                }
            } else {
                console.log(`[Hoạt Động Ngày Enhancer] Không tìm thấy rương với ID: ${id}`);
            }
        });
    }

    // ===============================================
    // HÀM XỬ LÝ KIỂM TRA VÀ TẠO NÚT NHIỆM VỤ
    // ===============================================

    function getMissionProgress(missionNameQuery) {
        const progressHeaders = document.querySelectorAll('.progress-header');
        let percentage = 0;

        for (const header of progressHeaders) {
            const missionNameElement = header.querySelector('.progress-title');
            const progressTextElement = header.querySelector('.progress-percentage');

            if (missionNameElement && progressTextElement) {
                const missionName = missionNameElement.textContent.trim();
                const progressMatch = progressTextElement.textContent.match(/(\d+)%/);

                if (missionName.includes(missionNameQuery) && progressMatch && progressMatch[1]) {
                    percentage = parseInt(progressMatch[1], 10);
                    return percentage; // Trả về ngay khi tìm thấy
                }
            }
        }
        return percentage; // Trả về 0 nếu không tìm thấy hoặc không có tiến trình
    }

    function checkAndSetMissionButtons() {
        const missionButtonsContainer = document.getElementById('missionButtonsContainer');
        missionButtonsContainer.innerHTML = ''; // Xóa các nút cũ trước khi tạo mới

        let allMissionsCompleted = true;

        DAILY_MISSIONS.forEach(mission => {
            const progress = getMissionProgress(mission.name);
            if (progress < 100) {
                allMissionsCompleted = false;
                console.log(`[Hoạt Động Ngày Enhancer] Nhiệm vụ chưa hoàn thành: ${mission.name} (${progress}%)`);

                const missionButton = document.createElement('a'); // Dùng <a> để dễ điều hướng
                missionButton.href = mission.url;
                missionButton.className = 'action-button mission-button';
                missionButton.textContent = `Đi đến ${mission.name} (${progress}%)`;
                missionButton.target = '_blank'; // Mở trong tab mới
                missionButtonsContainer.appendChild(missionButton);
            } else {
                console.log(`[Hoạt Động Ngày Enhancer] Nhiệm vụ đã hoàn thành: ${mission.name} (100%)`);
            }
        });

        if (allMissionsCompleted) {
            const allCompletedButton = document.createElement('button');
            allCompletedButton.className = 'action-button all-completed';
            allCompletedButton.textContent = 'Đã Hoàn Thành Tất Cả Nhiệm Vụ!';
            missionButtonsContainer.appendChild(allCompletedButton);
            console.log('[Hoạt Động Ngày Enhancer] Tất cả nhiệm vụ đã hoàn thành.');
        }
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================

    function initializeScript() {
        createCustomUI(); // Tạo UI
        // Đợi một chút sau khi UI được tạo và DOM ổn định để mở rương
        // và kiểm tra nhiệm vụ (quan trọng để có dữ liệu chính xác)
        setTimeout(() => {
            openRewardChests();
            checkAndSetMissionButtons(); // Cập nhật trạng thái nút sau khi rương có thể đã mở
        }, 1500);
    }

    // Đảm bảo DOM đã tải hoàn toàn
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript);
    } else {
        initializeScript();
    }

})();
