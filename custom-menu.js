// ==UserScript==
// @name          HH3D - Menu Tùy Chỉnh và Điểm Danh Tự Động
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       1.6
// @description   Thêm menu tùy chỉnh với các liên kết hữu ích và nút Điểm Danh - Tế lễ - Vấn Đáp tự động
// @author        Dr. Trune
// @match         https://hoathinh3d.mx/*
// @run-at        document-idle
// @grant         GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function() {
    'use strict';

    console.log('%c[HH3D Script] Tải thành công. Đang khởi tạo UI tùy chỉnh.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================
    const weburl = 'https://hoathinh3d.mx/';
    let questionDataCache = null;
    const QUESTION_DATA_URL = 'https://raw.githubusercontent.com/drtrune/hoathinh3d.script/main/vandap.json';
    let isCssInjected = false;
    // Cấu trúc menu đã được cập nhật để chỉ có một nút Điểm danh - Tế lễ - Vấn đáp
    const LINK_GROUPS = [
        {
            name: 'Điểm danh, Tế lễ, Vấn đáp',
            links: [
                { text: 'Điểm danh - Tế lễ - Vấn đáp', isFullAutomation: true }
            ]
        },
        {
            name: 'Hoang Vực, Thí Luyện, Phúc Lợi, Bí Cảnh',
            links: [
                { text: 'Hoang Vực', url: weburl + 'hoang-vuc' },
                { text: 'Thí Luyện', url: weburl + 'thi-luyen-tong-mon-hh3d' },
                { text: 'Phúc Lợi', url: weburl + 'phuc-loi-duong' },
                { text: 'Bí Cảnh', url: weburl + 'bi-canh-tong-mon' }
            ]
        },
        {
            name: 'Luận võ, Khoáng mạch',
            links: [
                { text: 'Luận Võ', url: weburl + 'luan-vo-duong' },
                { text: 'Khoáng Mạch', url: 'khoang-mach' }
            ]
        },
        {
            name: 'Bảng hoạt động ngày',
            links: [
                { text: 'Bảng hoạt động ngày', url: weburl + 'bang-hoat-dong-ngay' },
            ]
        }
    ];

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    // ===============================================
    // HÀM VẤN ĐÁP & ĐIỂM DANH
    // ===============================================

    //Lấy Nonce
    function getNonce() {
        if (typeof Better_Messages !== 'undefined' && Better_Messages.nonce) {
            return Better_Messages.nonce;
        }
        return null;
    }

    // Hàm tải đáp án từ GitHub
    function loadAnswersFromGitHub() {
        return new Promise((resolve, reject) => {
            if (questionDataCache) {
                resolve();
                return;
            }
            console.log('[Vấn Đáp] ▶️ Đang tải đáp án...');

            fetch(QUESTION_DATA_URL)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    questionDataCache = data;
                    console.log("[Vấn Đáp] ✅ Đã tải đáp án.");
                    resolve();
                })
                .catch(e => {
                    console.error("[Vấn Đáp] ❌ Lỗi tải hoặc parse JSON:", e);
                    showNotification('Lỗi khi tải đáp án. Vui lòng thử lại.', 'error');
                    reject(e);
                });
        });
    }

    //Hàm kiểm tra câu hỏi và trả lời
    async function checkAnswerAndSubmit(question, nonce, headers, url) {
        const normalizedIncomingQuestion = question.question.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');

        let foundAnswer = null;

        for (const storedQuestionKey in questionDataCache.questions) {
            const normalizedStoredQuestionKey = storedQuestionKey.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');

            if (normalizedStoredQuestionKey === normalizedIncomingQuestion) {
                foundAnswer = questionDataCache.questions[storedQuestionKey];
                break;
            }
        }

        if (!foundAnswer) {
            showNotification(`Vấn Đáp: Không tìm thấy đáp án cho câu hỏi: "${question}"` , 'error');
            return false;
        }

        const answerIndex = question.options.findIndex(option =>
            option.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '') ===
            foundAnswer.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '')
        );

        if (answerIndex === -1) {
            console.error(`[HH3D Vấn Đáp] ❌ Lỗi: Đáp án "${foundAnswer}" không có trong các lựa chọn của server.`);
            showNotification(`Vấn Đáp: Câu hỏi: "${question}" không có đáp án đúng trong server.`, 'error');
            return false;
        }

        const payloadSubmitAnswer = new URLSearchParams();
        payloadSubmitAnswer.append('action', 'save_quiz_result');
        payloadSubmitAnswer.append('question_id', question.id);
        payloadSubmitAnswer.append('answer', answerIndex);

        const responseSubmit = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: payloadSubmitAnswer,
            credentials: 'include'
        });

        const dataSubmit = await responseSubmit.json();
        if (dataSubmit.success) {
            return true;
        } else {
            console.error(`[HH3D Vấn Đáp] ❌ Lỗi khi gửi đáp án:`, dataSubmit.message);
            showNotification(`Vấn Đáp: Lỗi khi gửi đáp án.`, 'error');
            return false;
        }
    }

    //Hàm vấn đáp
    async function doVanDap(nonce) {
        try {
            await loadAnswersFromGitHub();

            console.log('[HH3D Vấn Đáp] ▶️ Bắt đầu Vấn Đáp');
            const url = weburl + 'wp-content/themes/halimmovies-child/hh3d-ajax.php';
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
                'X-Wp-Nonce': nonce,
            };

            let correctCount = 0;
            let answeredThisSession = 0;
            const maxAttempts = 10;
            let currentAttempt = 0;
            let totalQuestions = 0;

            while (correctCount < 5 && currentAttempt < maxAttempts) {
                currentAttempt++;
                const payloadLoadQuiz = new URLSearchParams();
                payloadLoadQuiz.append('action', 'load_quiz_data');

                const responseQuiz = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: payloadLoadQuiz,
                    credentials: 'include'
                });

                const dataQuiz = await responseQuiz.json();

                if (!dataQuiz.success || !dataQuiz.data || !dataQuiz.data.questions) {
                    showNotification(`Vấn Đáp: ${dataQuiz.data.message || 'Lỗi khi lấy câu hỏi'}`, 'warn');
                    return;
                }

                if (dataQuiz.data.completed) {
                    showNotification('Đã hoàn thành vấn đáp hôm nay.', 'success');
                    return;
                }

                const questions = dataQuiz.data.questions;
                totalQuestions = questions.length;
                correctCount = dataQuiz.data.correct_answers || 0;
                const questionsToAnswer = questions.slice(correctCount);

                if (questionsToAnswer.length === 0) {
                     showNotification(`Vấn Đáp: Đã hoàn thành ${correctCount}/${totalQuestions} câu.`, 'success');
                     return;
                }

                let newAnswersFound = false;
                for (const question of questionsToAnswer) {
                    const isAnsweredSuccessfully = await checkAnswerAndSubmit(question, nonce, headers, url);
                    if (isAnsweredSuccessfully) {
                        answeredThisSession++;
                        newAnswersFound = true;
                    }
                }

                if (!newAnswersFound) {
                    break;
                }

                if (correctCount < 5) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            showNotification(`Hoàn thành Vấn Đáp. Đã trả lời thêm ${answeredThisSession} câu. Tổng số câu đúng: ${correctCount}/${totalQuestions}`, 'success');

        } catch (e) {
            console.error(`[HH3D Vấn Đáp] ❌ Lỗi xảy ra:`, e);
            showNotification(`Lỗi khi thực hiện Vấn Đáp: ${e.message}`, 'error');
        }
    }

    // Hàm điểm danh hàng ngày
    async function doDailyCheckin(nonce) {
        try {
            console.log('[HH3D Daily Check-in] ▶️ Bắt đầu Daily Check-in');
            const url = weburl + 'wp-json/hh3d/v1/action';
            const payload = new URLSearchParams();
            payload.append('action', 'daily_check_in');

            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Wp-Nonce': nonce
            };

            const response = await fetch(url, { method: 'POST', headers: headers, body: payload });
            const data = await response.json();

            if (response.ok && data.success) {
                showNotification(`Điểm danh: ${data.message} (${data.streak} ngày)`, 'success');
            } else {
                showNotification(`Điểm danh: ${data.message || 'Lỗi không xác định'}`, 'warn');
            }
        } catch (e) {
            console.error(`[HH3D Daily Check-in] ❌ Lỗi xảy ra:`, e);
            showNotification(`Lỗi khi thực hiện Daily Check-in: ${e.message}`, 'error');
        }
    }

    // Hàm tế lễ
    async function doClanDailyCheckin(nonce) {
        try {
            console.log('[HH3D Clan Check-in] ▶️ Bắt đầu Clan Check-in');
            const url = "https://hoathinh3d.mx/wp-json/tong-mon/v1/te-le-tong-mon";

            const headers = {
                "Content-Type": "application/json",
                "X-WP-Nonce": nonce,
            };

            const response = await fetch(url, {
                "credentials": "include",
                "headers": headers,
                "referrer": "https://hoathinh3d.mx/danh-sach-thanh-vien-tong-mon",
                "body": "{}",
                "method": "POST",
                "mode": "cors"
            });

            const data = await response.json();
            if (response.ok && data.success) {
                showNotification(`Tế lễ: ${data.message} (${data.cong_hien_points})`, 'success');
            } else {
                showNotification(`Tế lễ: ${data.message || 'Lỗi không xác định'}`, 'warn');
            }
        } catch (e) {
            console.error(`[HH3D Clan Check-in] ❌ Lỗi xảy ra:`, e);
            showNotification(`Lỗi khi thực hiện Clan Check-in: ${e.message}`, 'error');
        }
    }

    // ===============================================
    // HÀM HIỂN THỊ THÔNG BÁO
    // ===============================================
    function showNotification (message, type = 'success', duration = 3000) {

        // --- Bắt đầu phần chèn CSS tự động ---
        if (!isCssInjected) {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.innerHTML = `
                #hh3d-notification-container {
                  position: fixed;
                  top: 20px;
                  right: 20px;
                  display: flex;
                  flex-direction: column;
                  align-items: flex-end;
                  gap: 10px;
                  z-index: 10000;
                  pointer-events: none;
                }

                .hh3d-notification-item {
                  padding: 10px 20px;
                  border-radius: 5px;
                  color: white;
                  min-width: 250px;
                  max-width: 350px;
                  pointer-events: auto;
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                  transition: all 0.5s ease-in-out;
                  opacity: 0;
                  transform: translateX(100%);
                }

                .hh3d-notification-item.success {
                  background-color: #4CAF50;
                }
                .hh3d-notification-item.warn {
                  background-color: #ff9800;
                }
                .hh3d-notification-item.error {
                  background-color: #f44336;
                }
            `;
            document.head.appendChild(style);
            isCssInjected = true;
        }
        // --- Kết thúc phần chèn CSS tự động ---

        // Log console
        const logPrefix = '[HH3D Notification]';
        if (type === 'success') {
            console.log(`${logPrefix} ✅ SUCCESS: ${message}`);
        } else if (type === 'warn') {
            console.warn(`${logPrefix} ⚠️ WARN: ${message}`);
        } else {
            console.error(`${logPrefix} ❌ ERROR: ${message}`);
        }

        // Tạo container nếu chưa tồn tại
        let container = document.getElementById('hh3d-notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hh3d-notification-container';
            document.body.appendChild(container);
        }

        // Tạo item thông báo
        const notification = document.createElement('div');
        notification.className = `hh3d-notification-item ${type}`;
        notification.innerText = message;

        container.appendChild(notification);

        // Hiển thị thông báo với hiệu ứng trượt vào
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        // Tự động ẩn và xóa thông báo
        let timeoutId = setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 500);
        }, duration);

        // Cho phép người dùng tương tác
        notification.addEventListener('mouseenter', () => {
            clearTimeout(timeoutId);
        });

        notification.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 500);
            }, 500);
        });

        notification.addEventListener('click', () => {
            clearTimeout(timeoutId);
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 500);
        });
    };


    // ===============================================
    // HÀM TẠO UI NÚT MENU TÙY CHỈNH
    // ===============================================

    function createCustomMenuButton() {
        addStyle(`
            .custom-script-menu {
                display: flex !important;
                flex-direction: column !important;
                position: absolute;
                background-color: #242323ff;
                min-width: 280px !important;
                z-index: 1001;
                border-radius: 5px;
                top: calc(100% + 5px);
                right: 0;
                padding: 10px;
                gap: 6px;
            }
            .custom-script-menu.hidden {
                visibility: hidden;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }
            .custom-script-menu-group {
                display: flex;
                flex-direction: row;
                gap: 5px;
                flex-wrap: wrap;
                justify-content: flex-start;
            }
            .custom-script-menu-group a, .custom-script-menu-group button {
                color: black;
                padding: 10px 10px !important;
                font-size: 13px !important;
                text-decoration: none;
                border-radius: 5px;
                background-color: #f1f1f1;
                flex-grow: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                border: none;
                cursor: pointer;
            }
            .custom-script-menu-group a:hover, .custom-script-menu-group button:hover {
                box-shadow: 0 0 15px rgba(52, 152, 219, 0.7);
            }
        `);

        const notificationsDivSelector = '.load-notification.relative';

        const observer = new MutationObserver((mutationsList, observer) => {
            const notificationsDiv = document.querySelector(notificationsDivSelector);
            if (notificationsDiv) {
                console.log('[HH3D Script] ✅ Đã tìm thấy nút thông báo. Đang chèn menu.');
                observer.disconnect();

                const parentNavItems = notificationsDiv.parentNode;

                if (parentNavItems && parentNavItems.classList.contains('nav-items')) {
                    const customMenuWrapper = document.createElement('div');
                    customMenuWrapper.classList.add('load-notification', 'relative', 'custom-script-item-wrapper');

                    const newMenuButton = document.createElement('a');
                    newMenuButton.href = '#';
                    newMenuButton.setAttribute('data-view', 'hide');

                    const iconDiv = document.createElement('div');
                    const iconSpan = document.createElement('span');
                    iconSpan.classList.add('material-icons-round1', 'material-icons-menu');
                    iconSpan.textContent = 'task';
                    iconDiv.appendChild(iconSpan);
                    newMenuButton.appendChild(iconDiv);

                    const dropdownMenu = document.createElement('div');
                    dropdownMenu.className = 'custom-script-menu hidden';

                    LINK_GROUPS.forEach(group => {
                        const groupDiv = document.createElement('div');
                        groupDiv.className = 'custom-script-menu-group';

                        group.links.forEach(link => {
                            // Tạo một nút duy nhất cho tất cả các tác vụ tự động
                            if (link.isFullAutomation) {
                                const autoTaskButton = document.createElement('button');
                                autoTaskButton.textContent = link.text;
                                autoTaskButton.id = 'auto-task-btn';

                                autoTaskButton.addEventListener('click', async () => {
                                    console.log('[HH3D Script] 🖱️ Nút Điểm Danh - Tế lễ - Vấn đáp đã được nhấn.');
                                    autoTaskButton.disabled = true;
                                    autoTaskButton.textContent = 'Đang xử lý...';

                                    const nonce = getNonce();
                                    if (!nonce) {
                                        const msg = 'Không tìm thấy nonce! Vui lòng tải lại trang.';
                                        showNotification(msg, 'error');
                                        console.error(`[HH3D Script] ❌ ERROR: ${msg}`);
                                        autoTaskButton.disabled = false;
                                        autoTaskButton.textContent = 'Điểm danh - Tế lễ - Vấn đáp';
                                        return;
                                    }

                                    // Gọi tuần tự các hàm
                                    await doDailyCheckin(nonce);
                                    await doClanDailyCheckin(nonce);
                                    await doVanDap(nonce);

                                    autoTaskButton.textContent = 'Điểm danh - Tế lễ - Vấn đáp';
                                    autoTaskButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Tất cả nhiệm vụ đã hoàn thành.');
                                });
                                groupDiv.appendChild(autoTaskButton);
                            } else {
                                const menuItem = document.createElement('a');
                                menuItem.href = link.url;
                                menuItem.textContent = link.text;
                                menuItem.target = '_blank';
                                groupDiv.appendChild(menuItem);
                            }
                        });

                        dropdownMenu.appendChild(groupDiv);
                    });

                    customMenuWrapper.appendChild(newMenuButton);
                    customMenuWrapper.appendChild(dropdownMenu);
                    parentNavItems.insertBefore(customMenuWrapper, notificationsDiv.nextSibling);

                    console.log('[HH3D Script] Đã chèn nút menu tùy chỉnh thành công.');

                    newMenuButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        dropdownMenu.classList.toggle('hidden');
                        if (dropdownMenu.classList.contains('hidden')) {
                            iconSpan.textContent = 'task';
                        } else {
                            iconSpan.textContent = 'highlight_off';
                        }
                    });

                    document.addEventListener('click', function(e) {
                        if (!customMenuWrapper.contains(e.target)) {
                            dropdownMenu.classList.add('hidden');
                        }
                    });
                } else {
                    console.warn('[HH3D Script - Cảnh báo] Không tìm thấy phần tử cha ".nav-items". Không thể chèn menu.');
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        console.log('[HH3D Script] Đang theo dõi DOM để chèn nút.');
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================
    createCustomMenuButton();
})();