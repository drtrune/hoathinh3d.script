// ==UserScript==
// @name          HH3D - Menu Tùy Chỉnh
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       2.3
// @description   Thêm menu tùy chỉnh với các liên kết hữu ích và các chức năng tự động
// @author        Dr. Trune
// @match         https://hoathinh3d.mx/*
// @run-at        document-idle
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
            isLuanVo: true
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
    // Lấy ID tài khoản
    function getAccountId() {
        if (typeof Better_Messages !== 'undefined' && Better_Messages.user_id) {
            return Better_Messages.user_id;
        }
        return null;
    }
    // Lưu trữ trạng thái các hoạt động đã thực hiện
    class TaskTracker {
        constructor(storageKey = 'dailyTasks') {
            this.storageKey = storageKey;
            this.data = this.loadData();
        }

        // Tải dữ liệu từ localStorage
        loadData() {
            const storedData = localStorage.getItem(this.storageKey);
            return storedData ? JSON.parse(storedData) : {};
        }

        // Lưu dữ liệu vào localStorage
        saveData() {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
        }

        /** Lấy thông tin của một tài khoản cụ thể và tự động cập nhật nếu sang ngày mới
            * @param {string} accountId - ID của tài khoản.
            * @return {object} Trả về dữ liệu tài khoản, bao gồm các nhiệm vụ và trạng thái.
            * Nếu tài khoản chưa có dữ liệu, nó sẽ tự động tạo mới và lưu vào localStorage.
            * Nếu ngày hôm nay đã được cập nhật, nó sẽ reset các nhiệm vụ cho ngày mới.
            * Nếu đã đến giờ chuyển sang lượt 2 của Đổ Thạch, nó sẽ tự động chuyển trạng thái.
        */
        getAccountData(accountId) {
            if (!this.data[accountId]) {
                this.data[accountId] = {};
                this.saveData();
            }

            const accountData = this.data[accountId];
            const today = new Date().toDateString();

            if (accountData.lastUpdatedDate !== today) {
                console.log(`[TaskTracker] Cập nhật dữ liệu ngày mới cho tài khoản: ${accountId}`);

                accountData.lastUpdatedDate = today;
                accountData.diemdanh = { date: today, done: false };
                accountData.thiluyen = { date: today, done: false, nextTime: null };
                accountData.bicanh = { date: today, done: false, nextTime: null };
                accountData.phucloi = { date: today, done: false, nextTime: null };
                accountData.hoangvuc = { date: today, done: false, nextTime: null };
                accountData.dothach = {
                    betplaced: false,
                    reward_claimed: false,
                    turn: 1,
                };
                this.saveData();
            }

            const currentTime = new Date();
            if (accountData.dothach.turn === 1 && currentTime.getHours() >= 16) {
                accountData.dothach = {
                    betplaced: false,
                    reward_claimed: false,
                    turn: 2,
                };
                this.saveData();
            }
            return accountData;
        }

        /**
         * Thêm một nhiệm vụ mới hoặc cập nhật nhiệm vụ hiện tại
         * @param {string} accountId - ID của tài khoản.
         * @param {string} taskName - Tên nhiệm vụ: 'diemdanh', 'thiluyen', 'bicanh', 'phucloi', 'hoangvuc', 'dothach'.
         * @param {object} newData - Dữ liệu nhiệm vụ mới hoặc cập nhật.
         * @return {void}
         */
        updateTask(accountId, taskName, newData) {
            const accountData = this.getAccountData(accountId);
            if (accountData[taskName]) {
                Object.assign(accountData[taskName], newData);
                this.saveData();
            } else {
                console.error(`[TaskTracker] Nhiệm vụ "${taskName}" không tồn tại cho tài khoản "${accountId}"`);
            }
        }

        // Lấy trạng thái của một nhiệm vụ
        getTaskStatus(accountId, taskName) {
            const accountData = this.getAccountData(accountId);
            return accountData[taskName] || null;
        }

        /**
         * Kiểm tra xem một nhiệm vụ đã hoàn thành hay chưa
         * @param {string} accountId - ID của tài khoản.
         * @param {string} taskName - Tên nhiệm vụ: 'diemdanh', 'thiluyen', 'bicanh', 'phucloi', 'hoangvuc'.
         * @return {boolean} Trả về `true` nếu nhiệm vụ đã hoàn thành, ngược lại là `false`.
         */
        isTaskDone(accountId, taskName) {
            const accountData = this.getAccountData(accountId);
            return accountData[taskName] && accountData[taskName].done;
        }

        /**
         * Đánh dấu một nhiệm vụ là đã hoàn thành
         * @param {string} accountId - ID của tài khoản.
         * @param {string} taskName - Tên nhiệm vụ: 'diemdanh', 'thiluyen', 'bicanh', 'phucloi', 'hoangvuc'.
         * @return {void}
         */
        markTaskDone(accountId, taskName) {
            const accountData = this.getAccountData(accountId);
            if (accountData[taskName]) {
                accountData[taskName].done = true;
                this.saveData();
            } else {
                console.error(`[TaskTracker] Nhiệm vụ "${taskName}" không tồn tại cho tài khoản "${accountId}"`);
            }
        }

        /**
         * Điều chỉnh thời gian của một nhiệm vụ
         * @param {string} accountId - ID của tài khoản.
         * @param {string} taskName - Tên nhiệm vụ: 'thiluyen', 'bicanh', 'phucloi', 'hoangvuc'.
         * @param {string} newTime - Thời gian mới theo định dạng `HH:mm:ss`.
         * @return {void}
         */
        adjustTaskTime(accountId, taskName, newTime) {
            const accountData = this.getAccountData(accountId);
            if (accountData[taskName]) {
                accountData[taskName].nextTime = newTime;
                this.saveData();
            } else {
                console.error(`[TaskTracker] Nhiệm vụ "${taskName}" không tồn tại cho tài khoản "${accountId}"`);
            }
        }
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
    // VẤN ĐÁP
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
                    taskTracker.markTaskDone(accountId, 'diemdanh');
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
    // ĐIỂM DANH
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
    // TẾ LỄ TÔNG MÔN
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

        const placeBetSecurity = await getSecurityNonce(weburl + 'do-thach-hh3d', /action: 'place_do_thach_bet',\s*security: '([a-f0-9]+)'/);
        if (!placeBetSecurity) {
            showNotification('Lỗi khi lấy security nonce để đặt cược.', 'error');
            return;
        }
        if (stonesToBet.length > 0) {
            for (const stone of stonesToBet) {
                console.log(`[HH3D Đổ Thạch] 🪙 Chuẩn bị đặt cược ${betAmount} Tiên Ngọc vào đá "${stone.name}" (ID: ${stone.stone_id})...`);
                await placeBet(stone, betAmount, placeBetSecurity);
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
    async function placeBet(stone, betAmount, placeBetSecurity) {
        console.log(`[HH3D Đặt Cược] 🪙 Đang tiến hành đặt cược ${betAmount} Tiên Ngọc vào ${stone.name}...`);
        
        const url = ajaxUrl;
        const payload = new URLSearchParams();
        
        payload.append('action', 'place_do_thach_bet');
        payload.append('security', placeBetSecurity);
        payload.append('stone_id', stone.stone_id);
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
                showNotification(`✅ Đặt cược thành công vào ${stone.name}! Tỷ lệ x${stone.reward_multiplier}`, 'success');
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
        if (!securityNonce) {
            showNotification('Lỗi khi lấy security nonce để nhận thưởng.', 'error');
            return false;
        }
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
                showNotification(`[Thí Luyện Tông Môn] ${errorMessage} `, 'error');
            }
        } catch (e) {
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
                        showNotification('Phúc Lợi Đường đã hoàn tất hôm nay!', 'success');
                        taskTracker.markTaskDone(accountId, 'phucloi');
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
                        showNotification(message, 'success');
                    } else {
                        const errorMessage = dataOpen.data && dataOpen.data.message ? dataOpen.data.message : 'Lỗi không xác định khi mở rương.';
                        showNotification(errorMessage, 'error');
                    }
                } else {
                    // Trường hợp còn thời gian
                    const message = `Vui lòng đợi ${time} để mở rương tiếp theo.`;
                    showNotification(message, 'warn');
                }
            } else {
                const errorMessage = dataTime.data && dataTime.data.message ? dataTime.data.message : 'Lỗi không xác định khi lấy thời gian.';
                showNotification(errorMessage, 'error');
            }
        } catch (e) {
            showNotification(`Lỗi mạng khi thực hiện Phúc Lợi Đường: ${e}`, 'error');
        }
    }

    // ===============================================
    // BÍ CẢNH
    // ===============================================
    class BiCanh {
        constructor(weburl) {
            this.weburl = weburl;
            this.logPrefix = '[HH3D Bí Cảnh]';
            this.showNotification = showNotification; // Hàm thông báo từ bên ngoài
        }

        /**
         * Phương thức chính để thực hiện toàn bộ nhiệm vụ Bí Cảnh.
         */
        async doBiCanh() {
            console.log(`${this.logPrefix} ▶️ Bắt đầu nhiệm vụ Bí Cảnh Tông Môn.`);

            // Bước 1: Lấy Nonce bảo mật
            const nonce = await this.getNonce();
            if (!nonce) {
                this.showNotification('Lỗi: Không thể lấy nonce cho Bí Cảnh Tông Môn.', 'error');
                return;
            }

            // Bước 2: Kiểm tra thời gian hồi chiêu
            const canAttack = await this.checkAttackCooldown(nonce);
            if (!canAttack) {
                this.showNotification('⏳ Đang trong thời gian hồi chiêu. Vui lòng thử lại sau.', 'info');
                return;
            }

            // Bước 3: Tấn công boss Bí Cảnh
            await this.attackBoss(nonce);
        }

        /**
         * Lấy nonce từ trang Bí Cảnh Tông Môn.
         * @returns {Promise<string|null>} Nonce bảo mật hoặc null nếu lỗi.
         */
        async getNonce() {
            const nonce = await getSecurityNonce(weburl + 'bi-canh-tong-mon', /"nonce":"([a-f0-9]+)"/);
            if (nonce) {
                return nonce;
            } else {
                return null;
            }
        }

        /**
         * Kiểm tra xem có thể tấn công boss Bí Cảnh hay không.
         * @param {string} nonce - Nonce bảo mật.
         * @returns {Promise<boolean>} True nếu có thể tấn công, ngược lại là false.
         */
        async checkAttackCooldown(nonce) {
            console.log(`${this.logPrefix} ⏲️ Đang kiểm tra thời gian hồi chiêu...`);
            const endpoint = 'wp-json/tong-mon/v1/check-attack-cooldown';

            try {
                const response = await this.sendApiRequest(endpoint, 'POST', nonce, {});
                if (response && response.success && response.can_attack) {
                    console.log(`${this.logPrefix} ✅ Có thể tấn công.`);
                    return true;
                } else {
                    const message = response?.message || 'Không thể tấn công vào lúc này.';
                    console.log(`${this.logPrefix} ⏳ ${message}`);
                    this.showNotification(`⏳ ${message}`, 'info');
                    return false;
                }
            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi kiểm tra cooldown:`, e);
                return false;
            }
        }

        /**
         * Gửi yêu cầu tấn công boss Bí Cảnh.
         * @param {string} nonce - Nonce bảo mật.
         */
        async attackBoss(nonce) {
            console.log(`${this.logPrefix} 🔥 Đang khiêu chiến boss...`);
            const endpoint = 'wp-json/tong-mon/v1/attack-boss';

            try {
                const response = await this.sendApiRequest(endpoint, 'POST', nonce, {});
                if (response && response.success) {
                    const message = response.message || `Gây ${response.damage} sát thương.`;
                    console.log(`${this.logPrefix} ✅ ${message}`);
                    this.showNotification(message, 'success');
                } else {
                    const errorMessage = response?.message || 'Lỗi không xác định khi tấn công.';
                    console.error(`${this.logPrefix} ❌ Lỗi tấn công:`, errorMessage);
                    this.showNotification(errorMessage, 'error');
                }
            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi tấn công:`, e);
                this.showNotification('Lỗi mạng khi tấn công boss Bí Cảnh.', 'error');
            }
        }


        /**  Kiểm tra xem có đạt giới hạn tấn công hàng ngày hay không.
         * @returns {Promise<boolean>} True nếu đạt giới hạn, ngược lại là false.
         * */
        async  isDailyLimit() {
            const endpoint = 'wp-json/tong-mon/v1/check-attack-cooldown';
            const nonce = await this.getNonce();
            if (!nonce) {
                return false;
            }
            try {
                const response = await this.sendApiRequest(endpoint, 'POST', nonce, {});
                if (response && response.success && response.cooldown_type	=== 'daily_limit' ) {
                    return true;
                } else {
                    return false;
                }
            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi kiểm tra cooldown:`, e);
                return false;
            }
        }
        /**
         * Hàm trợ giúp để gửi yêu cầu API.
         * @param {string} endpoint - Điểm cuối API.
         * @param {string} method - HTTP method (GET, POST).
         * @param {string} nonce - Nonce bảo mật.
         * @param {object} body - Dữ liệu body.
         * @returns {Promise<object|null>} Phản hồi từ API.
         */
        async sendApiRequest(endpoint, method, nonce, body = {}) {
            try {
                const url = `${this.weburl}${endpoint}`;
                const headers = { 
                    "Content-Type": "application/json", 
                    "X-WP-Nonce": nonce,
                    "Accept": "*/*",
                    "Accept-Language": "vi,en-US;q=0.5",
                    "X-Requested-With": "XMLHttpRequest",
                };
                const response = await fetch(url, {
                    method,
                    headers,
                    body: JSON.stringify(body),
                    credentials: 'include'
                });
                return await response.json();
            } catch (error) {
                console.error(`${this.logPrefix} ❌ Lỗi khi gửi yêu cầu tới ${endpoint}:`, error);
                throw error;
            }
        }
    }

    // ===============================================
    // HOANG VỰC
    // ===============================================

    class HoangVuc {
        constructor() {
            this.ajaxUrl = `${weburl}wp-content/themes/halimmovies-child/hh3d-ajax.php`;
            this.adminAjaxUrl = `${weburl}wp-admin/admin-ajax.php`;
            this.logPrefix = "[HH3D Hoang Vực]";
            this.headers = {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            };
        }
        /**
         * Lấy nguyên tố của người dùng từ trang Hoang Vực.
         */
        async getMyElement() {
            const url = weburl + 'hoang-vuc';
            const response = await fetch(url);
            const text = await response.text();
            const regex = /<img id="user-nguhanh-image".*?src=".*?ngu-hanh-(.*?)\.gif"/;
            const match = text.match(regex);
            if (match && match[1]) {
                const element = match[1];
                console.log(`${this.logPrefix} ✅ Đã lấy được nguyên tố của bạn: ${element}`);
                return element;
            } else {
                console.error(`${this.logPrefix} ❌ Không tìm thấy nguyên tố của người dùng.`);
                return null;
            }
        }

        /**
         * Xác định nguyên tố tối ưu dựa trên boss và chiến lược.
         * @param {string} bossElement - Nguyên tố của boss.
         * @param {boolean} maximizeDamage - true: tối đa hóa sát thương; false: tránh giảm sát thương.
         * @returns {Array<string>} Mảng chứa các nguyên tố phù hợp.
         */
        getTargetElement(bossElement, maximizeDamage) {
            const rules = {
                'kim': { khắc: 'moc', bị_khắc: 'hoa' },
                'moc': { khắc: 'tho', bị_khắc: 'kim' },
                'thuy': { khắc: 'hoa', bị_khắc: 'tho' },
                'hoa': { khắc: 'kim', bị_khắc: 'thuy' },
                'tho': { khắc: 'thuy', bị_khắc: 'moc' },
            };

            const suitableElements = [];

            if (maximizeDamage) {
                // Tối đa hóa sát thương: tìm nguyên tố khắc boss
                for (const myElement in rules) {
                    if (rules[myElement].khắc === bossElement) {
                        suitableElements.push(myElement);
                        break; // Chỉ cần một nguyên tố khắc là đủ
                    }
                }
            } else {
                // Không bị giảm sát thương: tìm tất cả các nguyên tố không bị boss khắc
                for (const myElement in rules) {
                    if (rules[myElement].bị_khắc !== bossElement) {
                        suitableElements.push(myElement);
                    }
                }
            }
            return suitableElements;
        }

        /**
         * Nhận thưởng Hoang Vực.
         */
        async claimHoangVucRewards(nonce) {
            const payload = new URLSearchParams();
            payload.append('action', 'claim_chest');
            payload.append('nonce', nonce);

            console.log(`${this.logPrefix} 🎁 Đang nhận thưởng...`);
            const response = await fetch(this.adminAjaxUrl, {
                method: 'POST',
                headers: this.headers,
                body: payload,
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) {
                const rewards = data.total_rewards;
                const message = `✅ Nhận thưởng thành công: +${rewards.tinh_thach} Tinh Thạch, +${rewards.tu_vi} Tu Vi.`;
                console.log(message);
                showNotification(message, 'success');
            } else {
                console.error(`${this.logPrefix} ❌ Lỗi khi nhận thưởng:`, data.message || 'Lỗi không xác định.');
                showNotification(data.message || 'Lỗi khi nhận thưởng.', 'error');
            }
        }

        /**
         * Tấn công boss Hoang Vực.
         */
        async attackHoangVucBoss(bossId, nonce) {
            const currentTime = Date.now();
            const payload = new URLSearchParams();
            payload.append('action', 'attack_boss');
            payload.append('boss_id', bossId);
            payload.append('nonce', nonce);
            payload.append('request_id', `req_${Math.random().toString(36).substring(2, 8)}${currentTime}`);
            
            console.log(`${this.logPrefix} ⚔️ Đang tấn công boss...`);
            const response = await fetch(this.ajaxUrl, {
                method: 'POST',
                headers: this.headers,
                body: payload,
                credentials: 'include'
            });
            const data = await response.json();
            if (data.success) {
                showNotification('✅ Tấn công boss hoang vực hành công', 'success');
            } else {
                const errorMessage = data.data.error || 'Lỗi không xác định khi tấn công.';
                showNotification(errorMessage, 'error');
            }
        }

        /**
         * Lặp lại việc đổi nguyên tố cho đến khi đạt được nguyên tố phù hợp hoặc không thể đổi tiếp.
         * @param {string} currentElement - Nguyên tố hiện tại của người dùng.
         * @param {string} bossElement - Nguyên tố của boss.
         * @param {boolean} maximizeDamage - Chiến lược tối đa hóa sát thương hay không.
         * @param {string} nonce - Nonce bảo mật.
         * @returns {Promise<string|null>} Nguyên tố mới nếu đổi thành công, ngược lại là null.
         */
        async changeElementUntilSuitable(currentElement, bossElement, maximizeDamage, nonce) {
            let myElement = currentElement;
            let changeAttempts = 0;
            const MAX_ATTEMPTS = 5;

            const rules = {
                'kim':  { khắc: 'moc',  bị_khắc: 'hoa' },
                'moc':  { khắc: 'tho',  bị_khắc: 'kim' },
                'thuy': { khắc: 'hoa',  bị_khắc: 'tho' },
                'hoa':  { khắc: 'kim',  bị_khắc: 'thuy' },
                'tho':  { khắc: 'thuy', bị_khắc: 'moc' },
            };

            function isOptimal(el) {
                return rules[el].khắc === bossElement;
            }
            function isNeutral(el) {
                return rules[el].bị_khắc !== bossElement;
            }

            while (changeAttempts < MAX_ATTEMPTS) {
                changeAttempts++;

                const currentlyOptimal = isOptimal(myElement);
                const currentlyNeutral = isNeutral(myElement);

                // 🔎 Kiểm tra trước khi đổi
                if (!currentlyNeutral) {
                    console.log(`${this.logPrefix} ❌ Đang bị boss khắc chế -> phải đổi.`);
                } else {
                    if (maximizeDamage && currentlyOptimal) {
                        console.log(`${this.logPrefix} 🌟 Đang ở trạng thái tối ưu. Dừng đổi.`);
                        return myElement;
                    }
                    if (!maximizeDamage && currentlyNeutral) {
                        console.log(`${this.logPrefix} ✅ Đang ở trạng thái hòa (không bị giảm). Dừng đổi.`);
                        return myElement;
                    }
                }

                // 🔄 Tiến hành đổi element
                const payloadChange = new URLSearchParams({ action: 'change_user_element', nonce });
                const changeData = await (await fetch(this.ajaxUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: payloadChange,
                    credentials: 'include'
                })).json();

                if (changeData.success) {
                    myElement = changeData.data.new_element;
                    console.log(`${this.logPrefix} 🔄 Đổi lần ${changeAttempts} -> ${myElement}`);
                } else {
                    console.error(`${this.logPrefix} ❌ Lỗi khi đổi:`, changeData.message || 'Không xác định.');
                    return myElement;
                }
            }

            // ⏳ Hết lượt đổi nhưng vẫn chưa đạt chiến lược
            console.log(`${this.logPrefix} ⚠️ Đã hết MAX_ATTEMPTS (${MAX_ATTEMPTS}). Chấp nhận nguyên tố cuối cùng: ${myElement}`);
            return myElement;
        }


        /**
         * Hàm chính để tự động hóa Hoang Vực.
         */
        async doHoangVuc(maximizeDamage = true) {
            console.log(`${this.logPrefix} ▶️ Bắt đầu nhiệm vụ với chiến lược: ${maximizeDamage ? 'Tối đa hóa Sát thương' : 'Không giảm Sát thương'}.`);

            const hoangVucUrl = `${weburl}hoang-vuc`;
            const nonce = await getSecurityNonce(hoangVucUrl, /var ajax_boss_nonce = '([a-f0-9]+)'/);
            if (!nonce) {
                showNotification('Lỗi: Không thể lấy nonce cho Hoang Vực.', 'error');
                return;
            }

            const payloadBossInfo = new URLSearchParams();
            payloadBossInfo.append('action', 'get_boss');
            payloadBossInfo.append('nonce', nonce);

            try {
                const bossInfoResponse = await fetch(this.ajaxUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: payloadBossInfo,
                    credentials: 'include'
                });
                const bossInfoData = await bossInfoResponse.json();

                if (bossInfoData.success) {
                    const boss = bossInfoData.data;

                    if (boss.defeated_time !== null && boss.has_pending_rewards) {
                        await this.claimHoangVucRewards(nonce);
                        return;
                    } else if (boss.created_time === new Date().toISOString().slice(0, 10) && boss.health === boss.max_health) {
                        showNotification('Boss Hoang vực đã bị phong ấn', 'info');
                        return;
                    }

                    let myElement = await this.getMyElement();
                    const bossElement = boss.element;
                    
                    // Lấy danh sách các nguyên tố phù hợp
                    const suitableElements = this.getTargetElement(bossElement, maximizeDamage);
                    
                    if (!suitableElements.includes(myElement)) {
                        console.log(`${this.logPrefix} 🔄 Nguyên tố hiện tại (${myElement}) không phù hợp. Đang thực hiện đổi.`);
                        const newElement = await this.changeElementUntilSuitable(myElement, bossElement, maximizeDamage, nonce);

                        if (newElement && suitableElements.includes(newElement)) {
                            myElement = newElement;
                            console.log(`${this.logPrefix} ✅ Đã có được nguyên tố phù hợp: ${myElement}.`);
                        } else {
                            console.log(`${this.logPrefix} ⚠️ Không thể có được nguyên tố phù hợp sau khi đổi. Tiếp tục với nguyên tố hiện tại.`);
                        }
                    } else {
                        console.log(`${this.logPrefix} ✅ Nguyên tố hiện tại (${myElement}) đã phù hợp. Không cần đổi.`);
                    }
                    
                    const timePayload = new URLSearchParams();
                    timePayload.append('action', 'get_next_attack_time');
                    const timeResponse = await fetch(this.ajaxUrl, {
                        method: 'POST',
                        headers: this.headers,
                        body: timePayload,
                        credentials: 'include'
                    });
                    const nextAttackTime = await timeResponse.json();

                    if (nextAttackTime.success && Date.now() >= nextAttackTime.data) {
                        await this.attackHoangVucBoss(boss.id, nonce);
                    } else {
                        const remainingTime = nextAttackTime.data - Date.now();
                        const remainingSeconds = Math.floor(remainingTime / 1000);
                        const minutes = Math.floor(remainingSeconds / 60);
                        const seconds = remainingSeconds % 60;
                        const message = `⏳ Cần chờ ${minutes} phút ${seconds} giây để tấn công tiếp theo.`;
                        console.log(`${this.logPrefix} ${message}`);
                        showNotification(message, 'info');
                    }
                } else {
                    const errorMessage = bossInfoData.message || 'Lỗi không xác định khi lấy thông tin boss.';
                    console.error(`${this.logPrefix} ❌ Lỗi:`, errorMessage);
                    showNotification(errorMessage, 'error');
                }
            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi mạng:`, e);
                showNotification('Lỗi mạng khi thực hiện Hoang Vực.', 'error');
            }
        }
    }

    // ===============================================
    // LUẬN VÕ
    // ===============================================

    class LuanVo {
        constructor() {
            this.weburl = 'https://hoathinh3d.mx/';
            this.logPrefix = '[HH3D Luận Võ]';
        }

        /**
         * Hàm hỗ trợ: Gửi yêu cầu API chung.
         */
        async sendApiRequest(endpoint, method, nonce, body = {}) {
            try {
                const url = `${this.weburl}${endpoint}`;
                const headers = { "Content-Type": "application/json", "X-WP-Nonce": nonce };
                const response = await fetch(url, {
                    method,
                    headers,
                    body: JSON.stringify(body),
                    credentials: 'include'
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                return await response.json();
            } catch (error) {
                console.error(`${this.logPrefix} ❌ Lỗi khi gửi yêu cầu tới ${endpoint}:`, error);
                return null;
            }
        }

        /**
         * Hàm hỗ trợ: Đợi một khoảng thời gian.
         */
        async delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /**
         * Đảm bảo tính năng tự động chấp nhận khiêu chiến được bật.
         */
        async ensureAutoAccept(nonce) {
            const toggleEndpoint = 'wp-json/luan-vo/v1/toggle-auto-accept';
            const result1 = await this.sendApiRequest(toggleEndpoint, 'POST', nonce, {});
            if (!result1 || !result1.success) return false;

            if (result1.message.includes('Đã bật')) return true;

            const result2 = await this.sendApiRequest(toggleEndpoint, 'POST', nonce, {});
            return result2 && result2.success && result2.message.includes('Đã bật');
        }

        /**
         * Lấy danh sách người chơi đang bật tự động chấp nhận.
         */
        async getFollowingUsers(nonce) {
            console.log(`${this.logPrefix} 🕵️ Đang lấy danh sách người theo dõi...`);
            const endpoint = 'wp-json/luan-vo/v1/get-following-users';
            const body = { page: 1 };
            const data = await this.sendApiRequest(endpoint, 'POST', nonce, body);

            if (data && data.success) {
                console.log(`${this.logPrefix} ✅ Lấy danh sách thành công. Tìm thấy ${data.data.users.length} người dùng.`);
                return data.data.users.filter(user => user.auto_accept === true);
            } else {
                const message = data?.message || 'Lỗi không xác định khi lấy danh sách người theo dõi.';
                console.error(`${this.logPrefix} ❌ ${message}`);
                return null;
            }
        }

        /**
         * Gửi yêu cầu khiêu chiến đến một người chơi cụ thể.
         */
    async sendChallenge(userId, nonce) {
        console.log(`${this.logPrefix} 🎯 Đang gửi khiêu chiến đến người chơi ID: ${userId}...`);

        const sendEndpoint = 'wp-json/luan-vo/v1/send-challenge';
        const sendBody = { target_user_id: userId };
        const sendResult = await this.sendApiRequest(sendEndpoint, 'POST', nonce, sendBody);

        if (sendResult && sendResult.success) {
            console.log(`${this.logPrefix} 🎉 Gửi khiêu chiến thành công! Challenge ID: ${sendResult.data.challenge_id}`);

            // Bước mới: Kiểm tra nếu đối thủ bật auto_accept
            if (sendResult.data.auto_accept) {
                console.log(`${this.logPrefix} ✨ Đối thủ tự động chấp nhận, đang hoàn tất trận đấu...`);
                
                const approveEndpoint = 'wp-json/luan-vo/v1/auto-approve-challenge';
                const approveBody = {
                    challenge_id: sendResult.data.challenge_id,
                    target_user_id: userId
                };

                const approveResult = await this.sendApiRequest(approveEndpoint, 'POST', nonce, approveBody);

                if (approveResult && approveResult.success) {
                    console.log(`${this.logPrefix} ✅ Trận đấu đã hoàn tất. Bạn đã thắng!`);
                    showNotification(`🎉 Đã đánh bại người chơi ID ${userId}!`, 'success');
                    return true;
                } else {
                    const message = approveResult?.data?.message || 'Lỗi không xác định khi hoàn tất trận đấu.';
                    console.error(`${this.logPrefix} ❌ Hoàn tất trận đấu thất bại: ${message}`);
                    showNotification(`❌ Lỗi hoàn tất trận đấu: ${message}`, 'error');
                    return false;
                }
            } else {
                console.log(`${this.logPrefix} ✅ Gửi khiêu chiến thành công, đối thủ không bật tự động chấp nhận.`);
                showNotification(`✅ Đã gửi khiêu chiến đến ${userId}! Đang chờ đối thủ chấp nhận.`, 'success');
                return true;
            }
        } else {
            const message = sendResult?.data?.message || 'Lỗi không xác định.';
            console.error(`${this.logPrefix} ❌ Gửi khiêu chiến thất bại: ${message}`);
            showNotification(`❌ Gửi khiêu chiến thất bại: ${message}`, 'error');
            return false;
        }
    }

        /**
         * Hiện hộp thoại và chuyển hướng đến trang Luận Võ trên tab hiện tại.
         */
        async goToLuanVoPage() {
            const luanVoUrl = `${weburl}/luan-vo-duong`;
            
            if (confirm("Bạn có muốn chuyển đến trang Luận Võ Đường không?")) {
                window.location.href = luanVoUrl;
            }
        }
        

        /**
         * Gửi yêu cầu nhận thưởng Luận Võ và xử lý phản hồi từ server.
         * @param {string} nonce - Nonce bảo mật của phiên làm việc.
         */
        async receiveReward(nonce) {
            console.log(`${this.logPrefix} 🎁 Đang gửi yêu cầu nhận thưởng...`);

            const endpoint = 'wp-json/luan-vo/v1/receive-reward';
            const body = {}; 

            try {
                const response = await fetch(`${this.weburl}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        "Content-Type": "application/json",
                        "X-WP-Nonce": nonce
                    },
                    body: JSON.stringify(body),
                    credentials: 'include'
                });

                const textResponse = await response.text();

                try {
                    const result = JSON.parse(textResponse);
                    // Case 1: Nhận được phản hồi JSON
                    if (result.success === false) {
                        const message = result.message || 'Lỗi không xác định.';
                        showNotification(message, 'error');
                        return;
                    }
                } catch (e) {
                    // Case 2: Không thể phân tích JSON (do response rỗng hoặc không phải JSON)
                    // Điều này xảy ra khi trang web tự tải lại sau khi gửi yêu cầu.
                    console.log(`${this.logPrefix} ✅ Lệnh nhận thưởng đã được gửi đi. Không có phản hồi JSON.`);
                }
                
                // Nếu không có lỗi, coi như thành công.
                showNotification('🎉 Đã nhận thưởng Luận Võ thành công!', 'success');

            } catch (error) {
                // Lỗi mạng hoặc lỗi khác
                console.error(`${this.logPrefix} ❌ Lỗi khi gửi lệnh nhận thưởng:`, error);
                showNotification(`❌ Lỗi khi gửi lệnh nhận thưởng: ${error.message}`, 'error');
            }
        }
        /**
         * Hàm chính: Chạy toàn bộ quy trình Luận Võ.
         * @param {string} nonce - Nonce bảo mật.
         * @param {function} getNonce - Hàm để lấy nonce từ trang web.
         * @param {function} showNotification - Hàm để hiển thị thông báo.
         */
        async startLuanVo(autoChallenge) {
            console.log(`${this.logPrefix} ▶️ Bắt đầu nhiệm vụ Luận Võ.`);
            const nonce = await getNonce();
            // Bước 1: Lấy nonce nếu chưa có
            if (!nonce) {
                showNotification('❌ Lỗi: Không thể lấy nonce cho Luận Võ.', 'error');
                return;
            }
            
            // Bước 2: Tham gia trận đấu
            const joinResult = await this.sendApiRequest(
                'wp-json/luan-vo/v1/join-battle', 'POST', nonce, {}
            );
            console.log(`${this.logPrefix} ✅ Tham gia trận đấu thành công.`);
            
            // Bước 3: Đảm bảo tự động chấp nhận khiêu chiến
            const autoAcceptSuccess = await this.ensureAutoAccept(nonce);
            if (!autoAcceptSuccess) {
                showNotification('⚠️ Tham gia thành công nhưng không thể bật tự động chấp nhận.', 'warning');
            } else {
                console.log(`${this.logPrefix} ✅ Tự động chấp nhận đã được bật.`);
            }

            // Bước 4: Khiêu chiến người chơi
            if (!autoChallenge) {
                //Hiện hộp thoại thông báo để người chơi tới trang luận võ thủ công
                this.goToLuanVoPage();
                return;
            }
            let users = await this.getFollowingUsers(nonce);
            if (!users || users.length === 0) {
                showNotification('ℹ️ Không có người chơi phù hợp để khiêu chiến.', 'info');
                return;
            }
            
            let challengesSent = 0;
            const maxChallenges = 5; // Có thể thay đổi
            
            for (const user of users) {
                if (challengesSent >= maxChallenges) {
                    break;
                }
                if (user.challenges_remaining > 0) {
                    const challengeSuccess = await this.sendChallenge(user.id, nonce);
                    if (challengeSuccess) {
                        challengesSent++;
                        await this.delay(5000); // Cách nhau 5 giây
                    }
                }
            }
            
            showNotification(`✅ Hoàn thành! Đã gửi ${challengesSent} khiêu chiến.`, 'success');
            // Bước 5: Nhận thưởng nếu có
            const rewardResult = await this.receiveReward(nonce);
        }
    }

    // ===============================================
    // HÀM HIỂN THỊ THÔNG BÁO
    //  
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
        } else if (type === 'info') {
            console.info(`${logPrefix} ℹ️ INFO: ${message}`);
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
    const hoangvuc = new HoangVuc();
    function createHoangVucMenu(parentGroup) {
            // --- Nút chính "Hoang Vực" ---
            const hoangVucButton = document.createElement('button');
            hoangVucButton.textContent = 'Hoang Vực';
            hoangVucButton.classList.add('custom-script-hoang-vuc-btn');
            hoangVucButton.addEventListener('click', async () => {
                console.log('[HH3D Hoang Vực] 🖱️ Nút Hoang vực vừa được nhấn');
                const maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
                console.log(`[HH3D Hoang Vực] Chế độ Tối đa hoá sát thương: ${maximizeDamage ? 'Bật' : 'Tắt'}`);

                hoangVucButton.disabled = true;
                hoangVucButton.textContent = 'Đang xử lý...';
                
                // Gọi phương thức qua instance của class
                await hoangvuc.doHoangVuc(maximizeDamage); // <--- SỬA Ở ĐÂY
                
                hoangVucButton.disabled = false;
                hoangVucButton.textContent = 'Hoang Vực';
            });

            // --- Nút cài đặt nhỏ ---
            const settingsButton = document.createElement('button');
            settingsButton.classList.add('custom-script-hoang-vuc-settings-btn');

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

            settingsButton.addEventListener('click', () => {
                let maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
                const newSetting = !maximizeDamage;
                localStorage.setItem('hoangvucMaximizeDamage', newSetting);
                if (newSetting) {
                    showNotification('[Hoang vực] Đổi ngũ hành để tối đa hoá sát thương', 'info');
                } else {
                    showNotification('[Hoang vực] Đổi ngũ hành để không bị giảm sát thương', 'info');
                }
                updateSettingsIcon();
            });

            parentGroup.appendChild(settingsButton);
            parentGroup.appendChild(hoangVucButton);
            
            updateSettingsIcon();
        }
    
    //Hàm tạo menu Luận Võ
    const luanVo = new LuanVo();
    function createLuanVoMenu(parentGroup) {
        const luanVoButton = document.createElement('button');
        const luanVoSettingsButton = document.createElement('button');
        luanVoSettingsButton.classList.add('custom-script-hoang-vuc-settings-btn');

        // Khởi tạo giá trị mặc định nếu chưa có
        // Sử dụng '1' và '0' để biểu thị trạng thái BẬT/TẮT.
        if (localStorage.getItem('luanVoAutoChallenge') === null) {
            localStorage.setItem('luanVoAutoChallenge', '1'); 
        }

        // Lấy giá trị ban đầu và chuyển thành boolean
        let autoChallengeEnabled = localStorage.getItem('luanVoAutoChallenge') === '1';

        // Cập nhật trạng thái hiển thị của nút
        const updateButtonState = (isEnabled) => {
            luanVoSettingsButton.textContent = isEnabled ? '✅' : '❌';
            luanVoSettingsButton.title = isEnabled ? 'Tự động thực hiện Luận Võ: Bật' : 'Tự động thực hiện Luận Võ: Tắt';
        };

        updateButtonState(autoChallengeEnabled); // Cập nhật trạng thái ban đầu

        parentGroup.appendChild(luanVoSettingsButton);

        // Thêm sự kiện click cho nút cài đặt Luận Võ
        luanVoSettingsButton.addEventListener('click', () => {
            autoChallengeEnabled = !autoChallengeEnabled; // Đảo ngược trạng thái
            localStorage.setItem('luanVoAutoChallenge', autoChallengeEnabled ? '1' : '0'); // Lưu lại vào localStorage
            updateButtonState(autoChallengeEnabled); // Cập nhật giao diện
            
            const message = autoChallengeEnabled ? 'Tự động thực hiện Luận Võ đã được bật' : 'Tự động thực hiện Luận Võ đã được tắt';
            showNotification(`[Luận Võ] ${message}`, 'info');
            console.log(`[HH3D Luận Võ] Trạng thái tự động thực hiện Luận Võ: ${autoChallengeEnabled}`);
        });

        luanVoButton.textContent = 'Luận Võ';
        luanVoButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
        luanVoButton.addEventListener('click', async () => {
            console.log('[HH3D Luận Võ] Nút Luận võ đã được nhấn');
            luanVoButton.disabled = true;
            luanVoButton.textContent = 'Đang xử lý...';

            try {
                // Lấy lại giá trị từ localStorage ngay trước khi gọi hàm, để đảm bảo chính xác
                const currentAutoChallenge = localStorage.getItem('luanVoAutoChallenge') === '1';
                await luanVo.startLuanVo(currentAutoChallenge);
            } catch (error) {
                console.error('[HH3D Luận Võ] ❌ Lỗi trong quá trình Luận Võ:', error);
                showNotification('❌ Lỗi trong quá trình Luận Võ.', 'error');
            } finally {
                luanVoButton.disabled = false;
                luanVoButton.textContent = 'Luận Võ';
            }
        });

        parentGroup.appendChild(luanVoButton);
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
                                    console.log('[HH3D Script] ✅ Tất cả nhiệm vụ đã hoàn thành.');
                                    if (taskTracker.isTaskDone(accountId, 'diemdanh')) {
                                    autoTaskButton.disabled = true;
                                    autoTaskButton.textContent = 'Đã hoàn thành Điểm danh - Tế lễ - Vấn đáp';
                                    } else {
                                        autoTaskButton.disabled = false;
                                        autoTaskButton.textContent = 'Điểm danh - Tế lễ - Vấn đáp';
                                    }
                                });
                                groupDiv.appendChild(autoTaskButton);
                                if (taskTracker.isTaskDone(accountId, 'diemdanh')) {
                                    autoTaskButton.disabled = true;
                                    autoTaskButton.textContent = 'Đã hoàn thành Điểm danh - Tế lễ - Vấn đáp';
                                }
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
                                    if (taskTracker.isTaskDone(accountId, 'phucloi')) {
                                        phucLoiButton.disabled = true;
                                        phucLoiButton.textContent = 'Phúc Lợi ✅';
                                    } else {
                                        phucLoiButton.textContent = 'Phúc Lợi';
                                        phucLoiButton.disabled = false;
                                    }
                                    console.log('[HH3D Script] ✅ Phúc Lợi đã hoàn thành.');
                                });
                                groupDiv.appendChild(phucLoiButton);
                                if (taskTracker.isTaskDone(accountId, 'phucloi')) {
                                        phucLoiButton.disabled = true;
                                        phucLoiButton.textContent = 'Phúc Lợi ✅';
                                    }
                            } else if (link.isBiCanh) {
                                const biCanhButton = document.createElement('button');
                                biCanhButton.textContent = link.text;
                                biCanhButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
                                const bicanh = new BiCanh();
                                biCanhButton.addEventListener('click', async() => {
                                    console.log('[HH3D Script] 🖱️ Nút Bí Cảnh đã được nhấn');
                                    biCanhButton.disabled = true;
                                    biCanhButton.textContent = 'Đang xử lý...';
                                    await bicanh.doBiCanh();
                                    biCanhButton.textContent = 'Bí Cảnh';
                                    biCanhButton.disabled = false;
                                    console.log('[HH3D Script] ✅ Bí Cảnh đã hoàn thành.');
                                });
                                groupDiv.appendChild(biCanhButton);
                                const biCanhLimit =  bicanh.isDailyLimit();
                                if (biCanhLimit) {
                                    biCanhButton.disabled = true;
                                    biCanhButton.textContent = 'Bí Cảnh ✅';
                                }
                            } else if (link.isHoangVuc) {
                                groupDiv.className = 'custom-script-hoang-vuc-group';
                                createHoangVucMenu(groupDiv);
                            } else if (link.isLuanVo) {
                                groupDiv.className = 'custom-script-hoang-vuc-group';
                                createLuanVoMenu(groupDiv);
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
    const taskTracker = new TaskTracker();
        const accountId = getAccountId();
        if (accountId) {
            let accountData = taskTracker.getAccountData(accountId)
            console.log(`[HH3D Script] ✅ Đã lấy dữ liệu tài khoản: ${JSON.stringify(accountData)}`);
        } else {
            console.warn('[HH3D Script] ⚠️ Không thể lấy ID tài khoản. Một số tính năng có thể không hoạt động.');      
        }
    createCustomMenuButton();
})();
