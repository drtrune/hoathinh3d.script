// ==UserScript==
// @name          HH3D - Menu Tùy Chỉnh
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       1.8
// @description   Thêm menu tùy chỉnh với các liên kết hữu ích và các chức năng tự động
// @author        Dr. Trune
// @match         https://hoathinh3d.mx/*
// @run-at        document-start
// @grant         GM_xmlhttpRequest
// @connect       raw.githubusercontent.com
// ==/UserScript==
(function() {
    'use strict';

    console.log('%c[HH3D Script] Tải thành công. Đang khởi tạo UI tùy chỉnh.', 'background: #222; color: #bada55; padding: 2px 5px; border-radius: 3px;');

    // ===============================================
    // HÀM TIỆN ÍCH CHUNG
    // ===============================================
    const weburl = 'https://hoathinh3d.mx/';
    const ajaxUrl = weburl + 'wp-content/themes/halimmovies-child/hh3d-ajax.php';
    let questionDataCache = null;
    const QUESTION_DATA_URL = 'https://raw.githubusercontent.com/drtrune/hoathinh3d.script/main/vandap.json';
    let isCssInjected = false;
    let userBetCount = 0;
    let userBetStones = [];
    // Cấu trúc menu đã được cập nhật để chỉ có một nút Điểm danh - Tế lễ - Vấn đáp
    const LINK_GROUPS = [{
        name: 'Điểm danh, Tế lễ, Vấn đáp',
        links: [{
            text: 'Điểm danh - Tế lễ - Vấn đáp',
            isFullAutomation: true
        }]
    }, {
        name: 'Hoang Vực, Thí Luyện, Phúc Lợi, Bí Cảnh',
        links: [{
            text: 'Hoang Vực',
            isHoangVuc: true
        }, {
            text: 'Thí Luyện',
            isThiLuyen: true
        }, {
            text: 'Phúc Lợi',
            isPhucLoi: true
        }, {
            text: 'Bí Cảnh',
            isBiCanh: true
        }]
    }, {
        name: 'Luận võ, Khoáng mạch',
        links: [{
            text: 'Luận Võ',
            url: weburl + 'luan-vo-duong'
        }, {
            text: 'Khoáng Mạch',
            url: weburl + 'khoang-mach'
        }]
    }, {
        name: 'Bảng hoạt động ngày',
        links: [{
            text: 'Bảng hoạt động ngày',
            url: weburl + 'bang-hoat-dong-ngay'
        }, ]
    }, {
        name: 'Đổ Thạch',
        links: [{
            text: 'Đổ Thạch',
            isDiceRoll: true
        }]
    }, ];

    function addStyle(css) {
        const style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    //Lấy Nonce
    function getNonce() {
        if (typeof Better_Messages !== 'undefined' && Better_Messages.nonce) {
            return Better_Messages.nonce;
        }
        return null;
    }

    /**
     * Lấy security nonce một cách chung chung từ một URL.
     *
     * @param {string} url - URL của trang web cần lấy nonce.
     * @param {RegExp} regex - Biểu thức chính quy (regex) để tìm và trích xuất nonce.
     * @returns {Promise<string|null>} Trả về security nonce nếu tìm thấy, ngược lại trả về null.
     */
    async function getSecurityNonce(url, regex) {
        // Sử dụng một tiền tố log cố định cho đơn giản
        const logPrefix = '[HH3D Auto]';

        console.log(`${logPrefix} ▶️ Đang tải trang từ ${url} để lấy security nonce...`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();

            const match = html.match(regex);
            if (match && match[1]) {
                const nonce = match[1];
                console.log(`${logPrefix} ✅ Đã trích xuất thành công security nonce: ${nonce}`);
                return nonce;
            } else {
                console.error(`${logPrefix} ❌ Không tìm thấy security nonce trong mã nguồn.`);
                return null;
            }
        } catch (e) {
            console.error(`${logPrefix} ❌ Lỗi khi tải trang hoặc trích xuất nonce:`, e);
            return null;
        }
    }


    // ===============================================
    // HÀM VẤN ĐÁP
    // ===============================================

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
            showNotification(`Vấn Đáp: Không tìm thấy đáp án cho câu hỏi: "${question}"`, 'error');
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
            const url = ajaxUrl;
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

    // ===============================================
    // Hàm điểm danh hàng ngày
    // ===============================================
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

            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payload
            });
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

    // ===============================================
    // Hàm tế lễ
    // ===============================================
    async function doClanDailyCheckin(nonce) {
        try {
            console.log('[HH3D Clan Check-in] ▶️ Bắt đầu Clan Check-in');
            const url = weburl + "wp-json/tong-mon/v1/te-le-tong-mon";

            const headers = {
                "Content-Type": "application/json",
                "X-WP-Nonce": nonce,
            };

            const response = await fetch(url, {
                "credentials": "include",
                "headers": headers,
                "referrer": weburl + "danh-sach-thanh-vien-tong-mon",
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
    // HÀM ĐỔ THẠCH
    // ===============================================

    /**
     * Lấy thông tin phiên đổ thạch sử dụng nonce đã lấy được.
     * @returns {Promise<object|null>} Dữ liệu phiên hoặc null nếu có lỗi.
     */
    async function getDiceRollInfo(securityNonce) {

        console.log('[HH3D Đổ Thạch] ▶️ Bắt đầu lấy thông tin phiên đổ thạch...');

        const url = ajaxUrl;
        const payload = new URLSearchParams();
        payload.append('action', 'load_do_thach_data');
        payload.append('security', securityNonce);

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payload
            });
            const data = await response.json();

            if (data.success) {
                const sessionData = data.data;
                console.log('[HH3D Đổ Thạch] ✅ Đã tải thông tin phiên đổ thạch thành công.');
                return sessionData;
            } else {
                console.error('[HH3D Đổ Thạch] ❌ Lỗi từ API:', data.data || 'Lỗi không xác định');
                return null;
            }
        } catch (e) {
            console.error('[HH3D Đổ Thạch] ❌ Lỗi mạng:', e);
            return null;
        }
    }

    // Hàm chính điều khiển toàn bộ logic Đổ Thạch
    async function doDiceRoll(stoneType) {
        console.log(`[HH3D Đổ Thạch] 🧠 Bắt đầu quy trình tự động với chiến lược: ${stoneType}...`);

        // Bước 1: Lấy thông tin phiên đổ thạch
        let securityNonce = await getSecurityNonce(weburl + 'do-thach-hh3d', /action: 'load_do_thach_data',\s*security: '([a-f0-9]+)'/);
        if (!securityNonce) {
            return null;
        }
        const sessionData = await getDiceRollInfo(securityNonce);

        // Kiểm tra xem dữ liệu có hợp lệ không
        if (!sessionData) {
            console.error('[HH3D Đổ Thạch] ❌ Không thể lấy dữ liệu phiên, dừng quy trình.');
            return;
        }

        let userBetCount = sessionData.stones.filter(stone => stone.bet_placed).length;
        let userBetStones = sessionData.stones.filter(stone => stone.bet_placed);

        // Bước 2: Kiểm tra trạng thái phiên để quyết định hành động
        if (sessionData.winning_stone_id) {
            console.log('[HH3D Đổ Thạch] 🎁 Đã có kết quả phiên. Kiểm tra để nhận thưởng...');

            // TÌM LƯỢT CƯỢC TRÚNG NHƯNG CHƯA NHẬN THƯỞNG
            const claimableWin = userBetStones.find(stone => 
                stone.stone_id === sessionData.winning_stone_id && stone.reward_claimed === false
            );

            // TÌM LƯỢT CƯỢC TRÚNG VÀ ĐÃ NHẬN THƯỞNG RỒI (dựa trên gợi ý của bạn)
            const alreadyClaimed = userBetStones.find(stone => 
                stone.stone_id === sessionData.winning_stone_id && stone.reward_claimed === true
            );

            if (claimableWin) {
                // TRƯỜNG HỢP 1: Thắng và chưa nhận thưởng -> Gọi API nhận
                console.log(`[HH3D Đổ Thạch] 🎉 Bạn đã trúng! Đá cược: ${claimableWin.name}. Đang tiến hành nhận thưởng...`);
                await claimReward();

            } else if (alreadyClaimed) {
                // TRƯỜNG HỢP 2: Thắng và đã nhận thưởng rồi -> Chỉ thông báo
                console.log(`[HH3D Đổ Thạch] ✅ Bạn đã nhận thưởng rồi.`);

            } else if (userBetStones.length > 0) {
                // TRƯỜNG HỢP 3: Có cược nhưng không trúng -> Thông báo
                showNotification('[Đổ Thạch] 🥲 Rất tiếc, bạn đã không trúng thưởng phiên này.', 'info');
            } else {
                // TRƯỜNG HỢP 4: Không cược -> Thông báo
                showNotification('[Đổ Thạch] 😶 Bạn đã không tham gia phiên này.', 'info');
            }
            
            return;
        }

        // Bước 3: Nếu không phải giờ nhận thưởng, tiến hành đặt cược
        console.log('[HH3D Đổ Thạch] 💰 Đang trong thời gian đặt cược.');

        if (userBetCount >= 2) {
            showNotification('[HH3D Đổ Thạch] ⚠️ Đã đạt giới hạn cược (2 lần). Vui lòng chờ phiên sau.', 'warn');
            return;
        }

        const sortedStones = sessionData.stones.sort((a, b) => b.reward_multiplier - a.reward_multiplier);
        const availableStones = sortedStones.filter(stone => !stone.bet_placed);

        if (availableStones.length === 0) {
            showNotification('[HH3D Đổ Thạch] ⚠️ Không còn đá nào để đặt cược!', 'warn');
            return;
        }

        const betAmount = 20; // Số tiền đặt cược cố định
        const stonesToBet = [];

        if (stoneType === 'tài' || stoneType === 'tai') {
            const firstStone = availableStones[0];
            const secondStone = availableStones[1];
            if (firstStone) stonesToBet.push(firstStone);
            if (secondStone) stonesToBet.push(secondStone);
        } else if (stoneType === 'xỉu' || stoneType === 'xiu') {
            if (availableStones.length >= 4) {
                const thirdStone = availableStones[2];
                const fourthStone = availableStones[3];
                if (thirdStone) stonesToBet.push(thirdStone);
                if (fourthStone) stonesToBet.push(fourthStone);
            } else {
                console.log('[HH3D Đổ Thạch] ⚠️ Không đủ đá để đặt cược "Xỉu".');
            }
        } else {
            console.log('[HH3D Đổ Thạch] ❌ Chiến lược đặt cược không hợp lệ. Vui lòng chọn "tài" hoặc "xỉu".');
            return;
        }

        if (stonesToBet.length > 0) {
            for (const stone of stonesToBet) {
                console.log(`[HH3D Đổ Thạch] 🪙 Chuẩn bị đặt cược ${betAmount} Tiên Ngọc vào đá "${stone.name}" (ID: ${stone.stone_id})...`);
                await placeBet(stone, betAmount);
            }
        } else {
            console.log('[HH3D Đổ Thạch] ⚠️ Không có đá nào được chọn để đặt cược.');
        }
    }

    /**
     * Gửi yêu cầu đặt cược đến server.
     * @param {object} stone - Đối tượng đá chứa thông tin cần thiết để đặt cược.
     * @param {number} betAmount - Số tiền (Tiên Ngọc) muốn đặt cược.
     * @returns {Promise<boolean>} True nếu đặt cược thành công, ngược lại là False.
     */
    async function placeBet(stone, betAmount) {
        console.log(`[HH3D Đặt Cược] 🪙 Đang tiến hành đặt cược ${betAmount} Tiên Ngọc vào ${stone.name}...`);
        
        const url = ajaxUrl;
        const payload = new URLSearchParams();
        const securityNonce = getSecurityNonce(weburl + 'do-thach-hh3d', /action: 'place_do_thach_bet',\s*security: '([a-f0-9]+)'/);
        payload.append('action', 'place_do_thach_bet');
        payload.append('security', securityNonce);
        payload.append('stone_id', stone.stoneId);
        payload.append('bet_amount', betAmount);

        const headers = {
            'Accept': '*/*', // <--- Đã thêm header này
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payload
            });
            const data = await response.json();

            if (data.success) {
                showNotification(`✅ Đặt cược thành công vào "${stone.name}"!`, 'success');
                return true;
            } else {
                const errorMessage = data.data || data.message || 'Lỗi không xác định từ server.';
                showNotification(`❌ Lỗi đặt cược đổ thạch: ${errorMessage}`, 'error');
                return false;
            }
        } catch (e) {
            showNotification(`❌ Lỗi mạng khi đặt cược đổ thạch: ${e}`, 'error');
            return false;
        }
    }

    // Hàm nhận thưởng sau khi đã trúng
    async function claimReward() {
        console.log('[HH3D Nhận Thưởng] 🎁 Đang tiến hành nhận thưởng...');

        const url = ajaxUrl;
        const payload = new URLSearchParams();
        const securityNonce = await getSecurityNonce(weburl + 'do-thach-hh3d', /action: 'claim_do_thach_reward',\s*security: '([a-f0-9]+)'/);
        payload.append('action', 'claim_do_thach_reward');
        payload.append('security', securityNonce);

        const headers = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payload
            });
            const data = await response.json();

            if (data.success) {
                const rewardMessage = data.data && data.data.message ? data.data.message : `Nhận thưởng thành công!`;
                showNotification(rewardMessage, 'success');
                return true;
            } else {
                const errorMessage = data.data && data.data.message ? data.data.message : 'Lỗi không xác định khi nhận thưởng.';
                showNotification(errorMessage, 'error');
                return false;
            }
        } catch (e) {
            console.error(e);
            return false;
        }
    }
    
    // ===============================================
    // THÍ LUYỆN TÔNG MÔN
    // ===============================================

    async function doThiLuyenTongMon() {
        console.log('[HH3D Thí Luyện Tông Môn] ▶️ Bắt đầu Thí Luyện Tông Môn');

        // Bước 1: Lấy security nonce. 
        const securityNonce = await getSecurityNonce(weburl + 'thi-luyen-tong-mon-hh3d', /action: 'open_chest_tltm',\s*security: '([a-f0-9]+)'/);
        if (!securityNonce) {
            console.error('[HH3D Thí Luyện Tông Môn] ❌ Không thể lấy security nonce.');
            showNotification('Lỗi khi lấy security nonce cho Thí Luyện Tông Môn.', 'error');
            return;
        }

        const url = ajaxUrl;
        const payload = new URLSearchParams();
        payload.append('action', 'open_chest_tltm');
        payload.append('security', securityNonce);

        const headers = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payload,
                credentials: 'include' // Quan trọng để gửi cookies
            });

            const data = await response.json();

            if (data.success) {
                // Trường hợp thành công
                const message = data.data && data.data.message ? data.data.message : 'Mở rương thành công!';
                console.log(`[Thí Luyện Tông Môn] ✅ ${message}`);
                // Show thông báo chi tiết nếu có
                if (data.data.tinh_thach) {
                    showNotification(`[Thí Luyện Tông Môn] Đã nhận được ${data.data.tinh_thach} Tinh Thạch!`, 'success');
                } else {
                    showNotification(message, 'success');
                }
            } else {
                // Trường hợp thất bại
                const errorMessage = data.data && data.data.message ? data.data.message : 'Lỗi không xác định khi mở rương.';
                console.error(`[ Thí Luyện Tông Môn] ❌ Lỗi:`, errorMessage);
                showNotification(`[Thí Luyện Tông Môn] ${errorMessage} `, 'error');
            }
        } catch (e) {
            console.error('[HH3D Thí Luyện Tông Môn] ❌ Lỗi mạng:', e);
            showNotification('Lỗi mạng khi thực hiện Thí Luyện Tông Môn.', 'error');
        }
    }

    // ===============================================
    // PHÚC LỢI
    // ===============================================
    async function doPhucLoiDuong() {
        console.log('[HH3D Phúc Lợi Đường] ▶️ Bắt đầu nhiệm vụ Phúc Lợi Đường.');

        // Bước 1: Lấy security nonce từ trang Phúc Lợi Đường
        const securityNonce = await getSecurityNonce(weburl + 'phuc-loi-duong', /action: 'get_next_time_pl',\s*security: '([a-f0-9]+)'/);
        if (!securityNonce) {
            console.error('[HH3D Phúc Lợi Đường] ❌ Không thể lấy security nonce.');
            showNotification('Lỗi khi lấy security nonce cho Phúc Lợi Đường.', 'error');
            return;
        }
        
        const url = ajaxUrl;
        const headers = {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        // Bước 2: Lấy thông tin thời gian còn lại và cấp độ rương
        console.log('[HH3D Phúc Lợi Đường] ⏲️ Đang kiểm tra thời gian mở rương...');
        const payloadTime = new URLSearchParams();
        payloadTime.append('action', 'get_next_time_pl');
        payloadTime.append('security', securityNonce);
        
        try {
            const responseTime = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payloadTime,
                credentials: 'include'
            });
            const dataTime = await responseTime.json();

            if (dataTime.success) {
                const { time, chest_level: chest_level_string } = dataTime.data;
                const chest_level = parseInt(chest_level_string, 10);

                if (time === '00:00') {
                    if (chest_level >= 4) {
                        console.log('[HH3D Phúc Lợi Đường] ✅ Đã mở đủ 4 rương hôm nay. Nhiệm vụ hoàn tất.');
                        showNotification('Phúc Lợi Đường đã hoàn tất hôm nay!', 'success');
                        return;
                    }

                    // Bước 3: Nếu thời gian bằng 00:00, tiến hành mở rương
                    console.log(`[HH3D Phúc Lợi Đường] 🎁 Đang mở rương cấp ${chest_level + 1}...`);
                    const payloadOpen = new URLSearchParams();
                    payloadOpen.append('action', 'open_chest_pl');
                    payloadOpen.append('security', securityNonce);
                    payloadOpen.append('chest_id', chest_level + 1);

                    const responseOpen = await fetch(url, {
                        method: 'POST',
                        headers: headers,
                        body: payloadOpen,
                        credentials: 'include'
                    });
                    const dataOpen = await responseOpen.json();

                    if (dataOpen.success) {
                        const message = dataOpen.data && dataOpen.data.message ? dataOpen.data.message : 'Mở rương thành công!';
                        console.log(`[HH3D Phúc Lợi Đường] ✅ ${message}`);
                        showNotification(message, 'success');
                    } else {
                        const errorMessage = dataOpen.data && dataOpen.data.message ? dataOpen.data.message : 'Lỗi không xác định khi mở rương.';
                        console.error(`[HH3D Phúc Lợi Đường] ❌ Lỗi khi mở rương:`, errorMessage);
                        showNotification(errorMessage, 'error');
                    }
                } else {
                    // Trường hợp còn thời gian
                    const message = `Vui lòng đợi ${time} để mở rương tiếp theo.`;
                    console.log(`[HH3D Phúc Lợi Đường] ⏳ ${message}`);
                    showNotification(message, 'warn');
                }
            } else {
                const errorMessage = dataTime.data && dataTime.data.message ? dataTime.data.message : 'Lỗi không xác định khi lấy thời gian.';
                console.error(`[HH3D Phúc Lợi Đường] ❌ Lỗi:`, errorMessage);
                showNotification(errorMessage, 'error');
            }
        } catch (e) {
            console.error('[HH3D Phúc Lợi Đường] ❌ Lỗi mạng:', e);
            showNotification('Lỗi mạng khi thực hiện Phúc Lợi Đường.', 'error');
        }
    }

    // ===============================================
    // BÍ CẢNH
    // ===============================================

    // Lấy nonce từ biến toàn cục window.BossSystemConfig.

    /**
 * Tự động thực hiện nhiệm vụ Bí Cảnh Tông Môn bằng cách tải trang để lấy nonce.
 */
    async function doBiCanh() {
        console.log('[HH3D Bí Cảnh] ▶️ Bắt đầu nhiệm vụ Bí Cảnh Tông Môn.');

        // Bước 1: Tải trang và lấy nonce.
        // getSecurityNonce cần là một hàm async và bạn cần await kết quả của nó.
        const nonce = await getSecurityNonce(weburl + 'bi-canh-tong-mon', /"nonce":"([a-f0-9]+)"/);
        if (!nonce) {
            showNotification('Lỗi: Không thể lấy nonce cho Bí Cảnh Tông Môn.', 'error');
            return;
        }

        const headers = {
            'Accept': '*/*',
            'Accept-Language': 'vi,en-US;q=0.5',
            'Content-Type': 'application/json',
            'X-WP-Nonce': nonce,
            'X-Requested-With': 'XMLHttpRequest',
        };

        const requestOptions = {
            method: 'POST',
            headers: headers,
            body: '{}',
            credentials: 'include'
        };

        // Bước 2: Kiểm tra cooldown
        console.log('[HH3D Bí Cảnh] ⏲️ Đang kiểm tra thời gian hồi chiêu...');
        const checkCooldownUrl = weburl+ 'wp-json/tong-mon/v1/check-attack-cooldown';
        
        try {
            const cooldownResponse = await fetch(checkCooldownUrl, requestOptions);
            const cooldownData = await cooldownResponse.json();

            if (cooldownData.success && cooldownData.can_attack) {
                // Bước 3: Nếu có thể tấn công, tiến hành tấn công boss
                console.log('[HH3D Bí Cảnh] ✅ Có thể tấn công! Đang khiêu chiến...');
                const attackBossUrl = weburl+ 'wp-json/tong-mon/v1/attack-boss';
                
                const attackResponse = await fetch(attackBossUrl, requestOptions);
                const attackData = await attackResponse.json();

                if (attackData.success) {
                    const message = attackData.message || `Gây ${attackData.damage} sát thương.`;
                    console.log(`[HH3D Bí Cảnh] ✅ ${message}`);
                    showNotification(message, 'success');
                } else {
                    const errorMessage = attackData.message || 'Lỗi không xác định khi tấn công.';
                    console.error(`[HH3D Bí Cảnh] ❌ Lỗi tấn công:`, errorMessage);
                    showNotification(errorMessage, 'error');
                }
            } else {
                // Nếu đang trong thời gian cooldown hoặc không thể tấn công
                const message = cooldownData.message || 'Không thể tấn công vào lúc này.';
                console.log(`[HH3D Bí Cảnh] ⏳ ${message}`);
                showNotification(message, 'info');
            }
        } catch (e) {
            console.error('[HH3D Bí Cảnh] ❌ Lỗi mạng:', e);
            showNotification('Lỗi mạng khi thực hiện Bí Cảnh Tông Môn.', 'error');
        }
    }

    // ===============================================
    // HOANG VỰC
    // ===============================================
    // @param {boolean} maximizeDamage - true: tối đa hóa sát thương (khắc chế), false: tối thiểu hóa giảm sát thương (không bị khắc).
 
    async function doHoangVuc(maximizeDamage = true) {
        console.log(`[HH3D Hoang Vực] ▶️ Bắt đầu nhiệm vụ với chiến lược: ${maximizeDamage ? 'Tối đa hóa Sát thương' : 'Không giảm Sát thương'}.`);

        const ajaxUrl = weburl + 'wp-content/themes/halimmovies-child/hh3d-ajax.php';
        const adminAjaxUrl = weburl + 'wp-admin/admin-ajax.php';
        const hoangVucUrl = weburl + 'hoang-vuc';

        // Bước 1: Tải trang và lấy nonce.
        const nonce = await getSecurityNonce(hoangVucUrl, /var ajax_boss_nonce = '([a-f0-9]+)'/);
        if (!nonce) {
            showNotification('Lỗi: Không thể lấy nonce cho Hoang Vực.', 'error');
            return;
        }

        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };

        // Bước 2: Lấy thông tin boss.
        console.log('[HH3D Hoang Vực] ℹ️ Đang lấy thông tin boss...');
        const payloadBossInfo = new URLSearchParams();
        payloadBossInfo.append('action', 'get_boss');
        payloadBossInfo.append('nonce', nonce);

        try {
            const bossInfoResponse = await fetch(ajaxUrl, {
                method: 'POST',
                headers: headers,
                body: payloadBossInfo,
                credentials: 'include'
            });
            const bossInfoData = await bossInfoResponse.json();

            if (bossInfoData.success) {
                const boss = bossInfoData.data;
                const myElement = window.HoangVucConfig.myElement;
                const bossElement = boss.element;

                // Nếu boss đã chết, nhận thưởng và kết thúc.
                if (boss.defeated_time !== null && boss.has_pending_rewards) {
                    await claimHoangVucRewards(nonce, adminAjaxUrl, headers);
                    return;
                } else if (boss.created_time === dataTime(today, 'YYYY-MM-DD') && boss.health === boss.max_health) {
                    showNotification('Boss Hoang vực đã bị phong ấn', 'info');
                    return;
                }

                // Logic đổi nguyên tố.
                const targetElement = getTargetElement(bossElement, maximizeDamage);
                if (myElement !== targetElement) {
                    console.log(`[HH3D Hoang Vực] 🔄 Nguyên tố hiện tại (${myElement}) không phù hợp. Đang kiểm tra lượt đổi...`);
                    await checkAndChangeElement(nonce, ajaxUrl, headers, targetElement);
                } else {
                    console.log(`[HH3D Hoang Vực] ✅ Nguyên tố hiện tại (${myElement}) đã phù hợp. Không cần đổi.`);
                }

                // Kiểm tra thời gian hồi chiêu và tấn công.
                console.log('[HH3D Hoang Vực] ⏲️ Đang kiểm tra thời gian hồi chiêu...');
                const timePayload = new URLSearchParams();
                timePayload.append('action', 'get_next_attack_time');

                const timeResponse = await fetch(ajaxUrl, {
                    method: 'POST',
                    headers: headers,
                    body: timePayload,
                    credentials: 'include'
                });
                const nextAttackTime = await timeResponse.json();

                if (nextAttackTime.success) {
                    const currentTime = Date.now();
                    if (currentTime >= nextAttackTime.data) {
                        await attackHoangVucBoss(boss.id, nonce, ajaxUrl, headers);
                    } else {
                        const remainingTime = nextAttackTime.data - currentTime;
                        const remainingSeconds = Math.floor(remainingTime / 1000);
                        const minutes = Math.floor(remainingSeconds / 60);
                        const seconds = remainingSeconds % 60;
                        const message = `⏳ Cần chờ ${minutes} phút ${seconds} giây để tấn công tiếp theo.`;
                        console.log(`[HH3D Hoang Vực] ${message}`);
                        showNotification(message, 'info');
                    }
                } else {
                    console.error('[HH3D Hoang Vực] ❌ Lỗi khi lấy thời gian tấn công tiếp theo.');
                    showNotification('Lỗi khi lấy thời gian tấn công Hoang Vực.', 'error');
                }
            } else {
                const errorMessage = bossInfoData.message || 'Lỗi không xác định khi lấy thông tin boss.';
                console.error(`[HH3D Hoang Vực] ❌ Lỗi:`, errorMessage);
                showNotification(errorMessage, 'error');
            }
        } catch (e) {
            console.error('[HH3D Hoang Vực] ❌ Lỗi mạng:', e);
            showNotification('Lỗi mạng khi thực hiện Hoang Vực.', 'error');
        }
    }

    // Hàm phụ để nhận thưởng Hoang Vực
    async function claimHoangVucRewards(nonce) {
        const adminAjaxUrl = weburl + 'wp-admin/admin-ajax.php';
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
        };
        const payloadClaim = new URLSearchParams();
        payloadClaim.append('action', 'claim_chest');
        payloadClaim.append('nonce', nonce);

        console.log('[HH3D Hoang Vực] 🎁 Đang nhận thưởng...');
        const claimResponse = await fetch(adminAjaxUrl, {
            method: 'POST',
            headers: headers,
            body: payloadClaim,
            credentials: 'include'
        });
        const claimData = await claimResponse.json();

        if (claimData.success) {
            const rewards = claimData.total_rewards;
            const message = `✅ Nhận thưởng thành công: +${rewards.tinh_thach} Tinh Thạch, +${rewards.tu_vi} Tu Vi.`;
            console.log(message);
            showNotification(message, 'success');
        } else {
            console.error('[HH3D Hoang Vực] ❌ Lỗi khi nhận thưởng:', claimData.message || 'Lỗi không xác định.');
            showNotification(claimData.message || 'Lỗi khi nhận thưởng.', 'error');
        }
    }

    // Hàm phụ để tấn công Hoang Vực
    async function attackHoangVucBoss(bossId, nonce, url, headers) {
        const currentTime = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const requestId = `req_${randomString}${currentTime}`;
        
        console.log('[HH3D Hoang Vực] ⚔️ Đã đủ thời gian, đang tấn công boss...');
        const payloadAttack = new URLSearchParams();
        payloadAttack.append('action', 'attack_boss');
        payloadAttack.append('boss_id', bossId);
        payloadAttack.append('nonce', nonce);
        payloadAttack.append('request_id', requestId);

        const attackResponse = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: payloadAttack,
            credentials: 'include'
        });
        const attackData = await attackResponse.json();
        
        if (attackData.success) {
            const message = `✅ Tấn công thành công! Gây ${attackData.damage} sát thương.`;
            console.log(message);
            showNotification(message, 'success');
        } else {
            const errorMessage = attackData.message || 'Lỗi không xác định khi tấn công.';
            console.error(`[HH3D Hoang Vực] ❌ Lỗi tấn công:`, errorMessage);
            showNotification(errorMessage, 'error');
        }
    }

    async function checkAndChangeElement(nonce, url, headers) {
        const payloadCheckChange = new URLSearchParams();
        payloadCheckChange.append('action', 'check_free_change_status');
        payloadCheckChange.append('nonce', nonce);

        const checkChangeResponse = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: payloadCheckChange,
            credentials: 'include'
        });
        const changeStatus = await checkChangeResponse.json();

        if (changeStatus.success && changeStatus.data.free_change) {
            console.log('[HH3D Hoang Vực] ✅ Có lượt đổi nguyên tố miễn phí! Đang đổi...');
            const payloadChange = new URLSearchParams();
            payloadChange.append('action', 'change_user_element');
            payloadChange.append('nonce', nonce);

            const changeElementResponse = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: payloadChange,
                credentials: 'include'
            });
            const changeElementData = await changeElementResponse.json();

            if (changeElementData.success) {
                console.log('[HH3D Hoang Vực] ✅ Đổi nguyên tố thành công.');
                showNotification('Đã đổi nguyên tố miễn phí thành công!', 'success');
                // Cập nhật lại nguyên tố của mình sau khi đổi thành công
                window.HoangVucConfig.myElement = changeElementData.data.new_element;
            } else {
                console.error('[HH3D Hoang Vực] ❌ Lỗi khi đổi nguyên tố:', changeElementData.message || 'Lỗi không xác định.');
                showNotification('Lỗi khi đổi nguyên tố Hoang Vực.', 'error');
            }
        } else {
            console.log('[HH3D Hoang Vực] ⏳ Không có lượt đổi nguyên tố miễn phí.');
        }
    }

// Hàm xác định nguyên tố tối ưu dựa trên boss và chiến lược
    function getTargetElement(bossElement, maximizeDamage) {
        const rules = {
            'hoa': { khắc: 'thuy', bị_khắc: 'thuy' },
            'kim': { khắc: 'hoa', bị_khắc: 'thuy' },
            'thuy': { khắc: 'tho', bị_khắc: 'moc' },
            'moc': { khắc: 'kim', bị_khắc: 'kim' },
            'tho': { khắc: 'moc', bị_khắc: 'hoa' },
        };

        if (maximizeDamage) {
            // Tối đa hóa sát thương: chọn nguyên tố khắc chế boss
            for (const myElement in rules) {
                if (rules[myElement].khắc === bossElement) {
                    return myElement;
                }
            }
        } else {
            // Giảm sát thương: chọn nguyên tố không bị boss khắc chế
            for (const myElement in rules) {
                if (rules[myElement].bị_khắc !== bossElement) {
                    return myElement;
                }
            }
        }
        return window.HoangVucConfig.myElement; // Trả về nguyên tố hiện tại nếu không tìm thấy
}


    // ===============================================
    // HÀM HIỂN THỊ THÔNG BÁO
    // ===============================================
    function showNotification(message, type = 'success', duration = 3000) {

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
                .hh3d-notification-item.info {
                  background-color: #0066ffff;
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

    // Hàm tạo menu đổ thạch
    function createDiceRollMenu(parentGroup) {
        // Thêm lớp dice-roll-group cho phần tử cha
        parentGroup.classList.add('custom-script-dice-roll-group');

        const select = document.createElement('select');
        select.id = 'dice-roll-select';
        select.classList.add('custom-script-dice-roll-select'); // Thêm lớp CSS cho dropdown

        const optionTai = document.createElement('option');
        optionTai.value = 'tai';
        optionTai.textContent = 'Tài';
        select.appendChild(optionTai);

        const optionXiu = document.createElement('option');
        optionXiu.value = 'xiu';
        optionXiu.textContent = 'Xỉu';
        select.appendChild(optionXiu);

        const rollButton = document.createElement('button');
        rollButton.textContent = 'Đổ Thạch';
        rollButton.classList.add('custom-script-menu-button', 'custom-script-dice-roll-btn'); // Thêm lớp CSS cho nút

        rollButton.addEventListener('click', () => {
            const selectedChoice = select.value;
            doDiceRoll(selectedChoice);
        });

        parentGroup.appendChild(select);
        parentGroup.appendChild(rollButton);
    }

    //Hàm tạo menu hoang vực
    function createHoangVucMenu(parentGroup) {

        // --- Nút chính "Hoang Vực" ---
        const hoangVucButton = document.createElement('button');
        hoangVucButton.textContent = 'Hoang Vực';
        hoangVucButton.classList.add('custom-script-hoang-vuc-btn');
        hoangVucButton.addEventListener('click', async () => {
            console.log('[HH3D Hoang Vực] 🖱️ Nút Hoang vực vừa được nhấn');
            // Đọc giá trị boolean, mặc định là false nếu chưa được cài đặt
            const maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
            console.log(`[HH3D Hoang Vực] Chế độ Tối đa hoá sát thương: ${maximizeDamage ? 'Bật' : 'Tắt'}`);

            hoangVucButton.disabled = true;
            hoangVucButton.textContent = 'Đang xử lý...';
            
            // Truyền thẳng giá trị boolean vào hàm xử lý
            await doHoangVuc(maximizeDamage);
            
            hoangVucButton.disabled = false;
            hoangVucButton.textContent = 'Hoang Vực';
        });

        // --- Nút cài đặt nhỏ ---
        const settingsButton = document.createElement('button');
        settingsButton.classList.add('custom-script-hoang-vuc-settings-btn');

        // Hàm để cập nhật icon và tooltip dựa trên giá trị boolean
        const updateSettingsIcon = () => {
            const maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
            if (maximizeDamage) {
                settingsButton.textContent = '↑';
                settingsButton.title = 'Tối đa hoá sát thương: Bật';
            } else {
                settingsButton.textContent = '-';
                settingsButton.title = 'Tối đa hoá sát thương: Tắt';
            }
        };

        // Gán sự kiện click cho nút cài đặt
        settingsButton.addEventListener('click', () => {
            let maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true'; // Đọc giá trị boolean từ localStorage
            const newSetting = !maximizeDamage; // Đảo ngược giá trị
            localStorage.setItem('hoangvucMaximizeDamage', newSetting); // Lưu giá trị mới vào localStorage
            if (newSetting) {
                showNotification('[Hoang vực] Đổi ngũ hành để tối đa hoá sát thương', 'info');
            } else {
                showNotification('[Hoang vực] Đổi ngũ hành để không bị giảm sát thương', 'info');
            }
            updateSettingsIcon(); // Cập nhật lại icon ngay lập tức
        });

        // Thêm cả hai nút vào group cha
        parentGroup.appendChild(settingsButton);
        parentGroup.appendChild(hoangVucButton);
        

        // Cài đặt icon ban đầu khi menu được tạo
        updateSettingsIcon();
    }

    // Hàm tạo nút menu tùy chỉnh
    function createCustomMenuButton() {
    addStyle(`
            /* Kiểu chung cho toàn bộ menu */
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

            /* Kiểu chung cho các nhóm nút */
            .custom-script-menu-group {
                display: flex;
                flex-direction: row;
                gap: 5px;
                flex-wrap: wrap;
                justify-content: flex-start;
            }

            /* Kiểu chung cho tất cả các nút (a, button) */
            .custom-script-menu-button,
            .custom-script-menu-link {
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
                transition: all 0.2s ease-in-out;
            }

            .custom-script-menu-button:hover,
            .custom-script-menu-link:hover {
                box-shadow: 0 0 15px rgba(52, 152, 219, 0.7);
                transform: scale(1.03); /* Thêm hiệu ứng phóng to nhẹ khi hover */
            }

            /* Kiểu riêng cho nút Điểm danh/Tế lễ/Vấn đáp */
            .custom-script-auto-btn {
                background-color: #3498db;
                color: white;
                font-weight: bold;
            }
            .custom-script-auto-btn:hover {
                background-color: #2980b9;
            }
            .custom-script-auto-btn:disabled {
                background-color: #7f8c8d;
                cursor: not-allowed;
                box-shadow: none;
            }

            /* Kiểu riêng cho dropdown và nút Đổ Thạch */
            .custom-script-dice-roll-group {
                display: flex;
                align-items: center;
                gap: 5px;
                flex-grow: 1;
            }
            .custom-script-dice-roll-select {
                padding: 9px 10px;
                font-size: 13px;
                border-radius: 5px;
                border: 1px solid #ccc;
                background-color: #fff;
                color: black;
                cursor: pointer;
                flex-grow: 1;
            }
            .custom-script-dice-roll-btn {
                background-color: #e74c3c;
                color: white;
                font-weight: bold;
            }
            .custom-script-dice-roll-btn:hover {
                background-color: #c0392b;
            }
            .custom-script-menu-group-dice-roll {
                display: flex;
                flex-direction: row;
                gap: 5px;
                flex-wrap: wrap;
                justify-content: flex-start;
                align-items: center;
            }


            /* Kiểu riêng cho nhóm Hoang Vực */
            .custom-script-hoang-vuc-group {
                display: flex;
                flex-direction: row;
                gap: 5px;
            }
            .custom-script-hoang-vuc-btn {
                background-color: #3498db;
                color: white;
                font-weight: bold;
                border: none;
                border-radius: 5px;
            }
            .custom-script-hoang-vuc-btn:hover {
                background-color: #3498db;
            }
            .custom-script-hoang-vuc-settings-btn {
                background-color: #3498db;
                color: white;
                font-weight: bold;
                width: 30px;
                height: 30px;
                display: flex;
                justify-content: center;
                align-items: center;
                margin-top: 5px;
                border-radius: 50%;
                border: none;
            }
            .custom-script-hoang-vuc-settings-btn:hover {
                background-color: #1f6da1ff;
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

                        dropdownMenu.appendChild(groupDiv);

                        group.links.forEach(link => {
                            if (link.isFullAutomation) {
                                const autoTaskButton = document.createElement('button');
                                autoTaskButton.textContent = link.text;
                                autoTaskButton.id = 'auto-task-btn';
                                autoTaskButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');

                                autoTaskButton.addEventListener('click', async() => {
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
                                    await doVanDap(nonce)
                                    autoTaskButton.textContent = 'Điểm danh - Tế lễ - Vấn đáp';
                                    autoTaskButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Tất cả nhiệm vụ đã hoàn thành.');
                                });
                                groupDiv.appendChild(autoTaskButton);
                            } else if (link.isDiceRoll) {
                                groupDiv.className = 'custom-script-menu-group-dice-roll';
                                createDiceRollMenu(groupDiv);
                            } else if (link.isThiLuyen) {
                                const thiLuyenButton = document.createElement('button');
                                thiLuyenButton.textContent = link.text;
                                thiLuyenButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');

                                thiLuyenButton.addEventListener('click', async() => {
                                    console.log('[HH3D Script] 🖱️ Nút Thí Luyện Tông Môn đã được nhấn.');
                                    thiLuyenButton.disabled = true;
                                    thiLuyenButton.textContent = 'Đang xử lý...';
                                    await doThiLuyenTongMon();
                                    thiLuyenButton.textContent = 'Thí Luyện';
                                    thiLuyenButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Thí Luyện Tông Môn đã hoàn thành.');
                                });
                                groupDiv.appendChild(thiLuyenButton);
                            } else if (link.isPhucLoi) {
                                const phucLoiButton = document.createElement('button');
                                phucLoiButton.textContent = link.text;
                                phucLoiButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
                                phucLoiButton.addEventListener('click', async() => {
                                    console.log('[HH3D Script] 🖱️ Nút Phúc Lợi đã được nhấn');
                                    phucLoiButton.disabled = true;
                                    phucLoiButton.textContent = 'Đang xử lý...';
                                    await doPhucLoiDuong();
                                    phucLoiButton.textContent = 'Phúc Lợi';
                                    phucLoiButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Phúc Lợi đã hoàn thành.');
                                });
                                groupDiv.appendChild(phucLoiButton);
                            } else if (link.isBiCanh) {
                                const biCanhButton = document.createElement('button');
                                biCanhButton.textContent = link.text;
                                biCanhButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
                                biCanhButton.addEventListener('click', async() => {
                                    console.log('[HH3D Script] 🖱️ Nút Bí Cảnh đã được nhấn');
                                    biCanhButton.disabled = true;
                                    biCanhButton.textContent = 'Đang xử lý...';
                                    await doBiCanh();
                                    biCanhButton.textContent = 'Bí Cảnh';
                                    biCanhButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Bí Cảnh đã hoàn thành.');
                                });
                                groupDiv.appendChild(biCanhButton);
                            } else if (link.isHoangVuc) {
                                groupDiv.className = 'custom-script-hoang-vuc-group';
                                createHoangVucMenu(groupDiv);
                            }
                            else {
                                const menuItem = document.createElement('a');
                                menuItem.classList.add('custom-script-menu-link');
                                menuItem.href = link.url;
                                menuItem.textContent = link.text;
                                menuItem.target = '_blank';
                                groupDiv.appendChild(menuItem);
                            }
                        });
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

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
        console.log('[HH3D Script] Đang theo dõi DOM để chèn nút.');
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================
    createCustomMenuButton();
})();
