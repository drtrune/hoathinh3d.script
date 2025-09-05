// ==UserScript==
// @name          HH3D - Menu Tùy Chỉnh
// @namespace     https://github.com/drtrune/hoathinh3d.script
// @version       3.0
// @description   Thêm menu tùy chỉnh với các liên kết hữu ích và các chức năng tự động
// @author        Dr. Trune
// @match         https://hoathinh3d.mx/*
// @run-at        document-idle
// @grant         GM_xmlhttpRequest
// @connect       raw.githubusercontent.com
// ==/UserScript==
(async function() {
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
        name: 'Autorun',
        links: [{
            text: 'Autorun',
            isAutorun: true
        }]
    }, {
        name: 'Điểm danh, Tế lễ, Vấn đáp',
        links: [{
            text: 'Điểm danh - Tế lễ - Vấn đáp',
            isDiemDanh: true
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
        name: 'Luận Võ',
        links: [{
            text: 'Luận Võ',
            isLuanVo: true
        }]
    }, {
        name: 'Khoáng mạch',
        links: [{
            text: 'Khoáng Mạch',
            isKhoangMach: true
        }]
    }, {
        name: 'Bảng hoạt động ngày',
        links: [{
            text: 'Bảng hoạt động ngày',
            url: weburl + 'bang-hoat-dong-ngay?t'
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
    async function getNonce() {
        if (typeof customRestNonce !== 'undefined' && customRestNonce) {
            return customRestNonce;
        }

        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const match = script.innerHTML.match(/customRestNonce\s*=\s*'([a-f0-9]+)'/);
            if (match) {
                return match[1];
            }
        }

        try {
            const nonce = await getSecurityNonce(weburl + '?t', /customRestNonce\s*=\s*'([a-f0-9]+)'/);
            if (nonce) {
                return nonce;
            }
        } catch (error) {
            console.error("Failed to get security nonce", error);
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


    // Lấy ID tài khoản
    async function getAccountId() {
        const html = document.documentElement.innerHTML;
        const regexList = [
            /"user_id"\s*:\s*"(\d+)"/,       // "user_id":"123"
            /current_user_id\s*:\s*'(\d+)'/  // current_user_id: '123'
        ];

        // --- Thử lấy trực tiếp từ DOM ---
        for (const regex of regexList) {
            const match = html.match(regex);
            if (match) {
                console.log('Lấy account ID trực tiếp từ html');
                return match[1];
            }
        }

        // --- Fallback: thử fetch trang chính với từng regex ---
        for (const regex of regexList) {
            const id = await getSecurityNonce(weburl + '?t', regex);
            if (id) {
                console.log('Lấy account ID qua fetch fallback');
                return id;
            }
        }

        return null;
    }
    
    // Lưu trữ trạng thái các hoạt động đã thực hiện
    class TaskTracker {
        constructor(storageKey = 'dailyTasks') {
            this.storageKey = storageKey;
            this.data = this.loadData();
            this.dothachTimeoutId = null;
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
            const today = new Date().toLocaleDateString('vi-VN', {timeZone: 'Asia/Ho_Chi_Minh'});


            // Danh sách tất cả nhiệm vụ mặc định
            const defaultTasks = {
                diemdanh: { date: today, done: false },
                thiluyen: { date: today, done: false, nextTime: null },
                bicanh: { date: today, done: false, nextTime: null },
                phucloi: { date: today, done: false, nextTime: null },
                hoangvuc: { date: today, done: false, nextTime: null },
                dothach: { betplaced: false, reward_claimed: false, turn: 1 },
                luanvo: { date: today, battle_joined: false, auto_accept: false, done: false },
                khoangmach: {date: today, done: false, nextTime: null},
                tienduyen: {last_check: null}
            };

            if (accountData.lastUpdatedDate !== today) {
                console.log(`[TaskTracker] Cập nhật dữ liệu ngày mới cho tài khoản: ${accountId}`);
                accountData.lastUpdatedDate = today;
                // Reset toàn bộ nhiệm vụ
                Object.assign(accountData, defaultTasks);
                this.saveData();
            } else {
                // Ngày chưa đổi → merge các nhiệm vụ mới
                let updated = false;
                for (const taskName in defaultTasks) {
                    if (!accountData[taskName]) {
                        accountData[taskName] = defaultTasks[taskName];
                        updated = true;
                    }
                }
                if (updated) this.saveData();
            }

            // Xử lý Đổ Thạch lượt 2
            const now = new Date();
                const hourInVN = parseInt(
                    new Date().toLocaleString('en-US', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: 'numeric',
                        hour12: false
                    }),
                    10
                );
            if (accountData.dothach.turn === 1 && hourInVN >= 16) {
                accountData.dothach = {
                    betplaced: false,
                    reward_claimed: false,
                    turn: 2,
                };
                this.saveData();
            }

            // Lên lịch tự động reset vào 16h hàng ngày nếu chưa có timer
                if (!this.dothachTimeoutId) {
                    const now = new Date();
                    const nextResetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);

                    // Nếu giờ hiện tại đã qua 16h, lên lịch cho ngày hôm sau
                    if (now.getTime() >= nextResetTime.getTime()) {
                        nextResetTime.setDate(now.getDate() + 1);
                    }

                    const timeToWait = nextResetTime.getTime() - now.getTime();
                    
                    console.log(`[TaskTracker] Đổ Thạch reset sẽ chạy sau ${Math.floor(timeToWait / 1000 / 60)} phút.`);

                    // Đặt timeout và lưu ID
                    this.dothachTimeoutId = setTimeout(() => {
                        // Tự động gọi lại hàm này để cập nhật dữ liệu và lên lịch lại
                        this.getAccountData(accountId);
                    }, timeToWait);
                }

            return accountData;
        }

        /**
         * Cập nhật một thuộc tính cụ thể của một nhiệm vụ.
         * @param {string} accountId - ID của tài khoản.
         * @param {string} taskName - Tên nhiệm vụ (ví dụ: 'dothach').
         * @param {string} key - Tên thuộc tính cần cập nhật (ví dụ: 'betplaced').
         * @param {*} value - Giá trị mới cho thuộc tính.
         */
        updateTask(accountId, taskName, key, value) {
            const accountData = this.getAccountData(accountId);
            if (accountData[taskName]) {
                accountData[taskName][key] = value;
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
         * @param {string} newTime - Thời gian mới theo định dạng timestamp.
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

        getNextTime(accountId, taskName) {
            const accountData = this.getAccountData(accountId);
            const ts = accountData[taskName]?.nextTime;
            if (!ts || ts === "null") {
                return null; // chưa có thời gian
            }
            const date = new Date(Number(ts));
            return isNaN(date.getTime()) ? null : date;
        }


        /** Return dạng Date */
        getLastCheckTienDuyen(accountId) {
            const accountData = this.getTaskStatus(accountId, 'tienduyen');
            const timestamp = Number(accountData.last_check); // Chuyển chuỗi miligiây thành số
            return new Date(timestamp); // Tạo đối tượng Date
        }

        /** Lấy cả timstamp dạng string hay Date đều được */
        setLastCheckTienDuyen(accountId, timestamp) {
            let finalTimestamp = timestamp; // Khởi tạo biến lưu giá trị cuối cùng
            // Kiểm tra nếu timestamp là một đối tượng Date
            if (timestamp instanceof Date) {
                finalTimestamp = timestamp.getTime(); // Lấy giá trị timestamp dạng số
            }
            this.updateTask(accountId, 'tienduyen', 'last_check', finalTimestamp);
        }


    }


    /**
     * Cộng thêm phút và giây vào thời điểm hiện tại và trả về một đối tượng Date mới.
     * @param {string} timeString - Chuỗi thời gian định dạng "mm:ss" (phút:giây).
     * @returns {Date} - String dạng timestamp cho thời gian được cộng thêm
     */
    function timePlus(timeString) {
        const now = new Date();
        const [minutes, seconds] = timeString.split(':').map(Number);
        const millisecondsToAdd = (minutes * 60 + seconds) * 1000;
        return now.getTime() + millisecondsToAdd;
        }


    // ===============================================
    // VẤN ĐÁP
    // ===============================================

    class VanDap {
        constructor(nonce) {
            this.nonce = nonce
            this.ajaxUrl = ajaxUrl;
            this.QUESTION_DATA_URL = QUESTION_DATA_URL;
            this.taskTracker = taskTracker;
            this.questionDataCache = null;
        }

        /**
         * * Tải dữ liệu đáp án từ nguồn GitHub.
         * * Dữ liệu được lưu vào cache để tránh các lần tìm nạp không cần thiết.
         */
        async loadAnswersFromGitHub() {
            if (this.questionDataCache) {
                return;
            }
            console.log('[Vấn Đáp] ▶️ Đang tải đáp án...');
            try {
                const response = await fetch(this.QUESTION_DATA_URL);
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                this.questionDataCache = await response.json();
                console.log("[Vấn Đáp] ✅ Đã tải đáp án.");
            } catch (e) {
                console.error("[Vấn Đáp] ❌ Lỗi tải hoặc parse JSON:", e);
                showNotification('Lỗi khi tải đáp án. Vui lòng thử lại.', 'error');
                throw e; // Ném lại lỗi để hàm gọi xử lý
            }
        }

        /**
         * Tìm câu trả lời đúng cho một câu hỏi và gửi nó đi.
         * @param {object} question Đối tượng câu hỏi từ máy chủ.
         * @param {object} headers Headers của yêu cầu để gửi đi.
         * @returns {Promise<boolean>} True nếu câu trả lời được gửi thành công, ngược lại là false.
         */
        async checkAnswerAndSubmit(question, headers) {
            const normalizedIncomingQuestion = question.question.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');

            let foundAnswer = null;

            // Tìm câu trả lời trong dữ liệu cache
            for (const storedQuestionKey in this.questionDataCache.questions) {
                const normalizedStoredQuestionKey = storedQuestionKey.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '');
                if (normalizedStoredQuestionKey === normalizedIncomingQuestion) {
                    foundAnswer = this.questionDataCache.questions[storedQuestionKey];
                    break;
                }
            }

            if (!foundAnswer) {
                showNotification(`<b>Vấn Đáp:</b> Không tìm thấy đáp án cho câu hỏi: <i>${question.question}</i>`, 'error');
                return false;
            }

            // Tìm chỉ mục của câu trả lời đúng trong các lựa chọn do máy chủ cung cấp
            const answerIndex = question.options.findIndex(option =>
                option.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '') ===
                foundAnswer.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?\s]/g, '')
            );

            if (answerIndex === -1) {
                showNotification(`Vấn Đáp: Câu hỏi: <i>${question.question}</i> không có đáp án đúng trong server.`, 'error');
                return false;
            }

            // Gửi câu trả lời
            const payloadSubmitAnswer = new URLSearchParams();
            payloadSubmitAnswer.append('action', 'save_quiz_result');
            payloadSubmitAnswer.append('question_id', question.id);
            payloadSubmitAnswer.append('answer', answerIndex);

            try {
                const responseSubmit = await fetch(this.ajaxUrl, {
                    method: 'POST',
                    headers: headers,
                    body: payloadSubmitAnswer,
                    credentials: 'include'
                });

                const dataSubmit = await responseSubmit.json();
                if (dataSubmit.success) {
                    return true;
                } else {
                    showNotification(`Vấn Đáp: ${dataSubmit.message}`, 'error');
                    return false;
                }
            } catch (error) {
                showNotification(`Vấn Đáp: ${error.message}`, 'error');
                return false;
            }
        }

        /**
         * Hàm chính để chạy quy trình Vấn Đáp.
         * @param {string} nonce Nonce của WordPress để xác thực.
         */
        async doVanDap(nonce) {
            try {
                await this.loadAnswersFromGitHub();

                console.log('[HH3D Vấn Đáp] ▶️ Bắt đầu Vấn Đáp');
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

                    const responseQuiz = await fetch(this.ajaxUrl, {
                        method: 'POST',
                        headers: headers,
                        body: payloadLoadQuiz,
                        credentials: 'include'
                    });

                    const dataQuiz = await responseQuiz.json();

                    if (!dataQuiz.success || !dataQuiz.data) {
                        showNotification(`Vấn Đáp: ${dataQuiz.data|| 'Lỗi khi lấy câu hỏi'}`, 'warn');
                        return;
                    }

                    if (dataQuiz.data.completed) {
                        showNotification('Đã hoàn thành vấn đáp hôm nay.', 'success');
                        taskTracker.markTaskDone(accountId, 'diemdanh');
                        return;
                    }

                    if (!dataQuiz.data.questions) {
                        showNotification(`Vấn Đáp: Không có câu hỏi nào được tải.`, 'warn');
                        return;
                    }

                    const questions = dataQuiz.data.questions;
                    totalQuestions = questions.length;
                    correctCount = dataQuiz.data.correct_answers || 0;
                    const questionsToAnswer = questions.slice(correctCount);

                    if (questionsToAnswer.length === 0) {
                        break;
                    }

                    let newAnswersFound = false;
                    for (const question of questionsToAnswer) {
                        const isAnsweredSuccessfully = await this.checkAnswerAndSubmit(question, headers);
                        if (isAnsweredSuccessfully) {
                            answeredThisSession++;
                            newAnswersFound = true;
                        }
                    }

                    if (!newAnswersFound) {
                        showNotification(`Vấn Đáp: Không tìm thấy câu trả lời mới, dừng lại.`, 'warn');
                        break;
                    }

                    if (correctCount + answeredThisSession < 5) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Tìm nạp trạng thái cuối cùng để báo cáo chính xác
                const finalPayload = new URLSearchParams();
                finalPayload.append('action', 'load_quiz_data');
                const finalResponse = await fetch(this.ajaxUrl, {
                    method: 'POST',
                    headers: headers,
                    body: finalPayload,
                    credentials: 'include'
                });
                const finalData = await finalResponse.json();
                if (finalData.success && finalData.data) {
                    correctCount = finalData.data.correct_answers || correctCount;
                    totalQuestions = finalData.data.questions.length || totalQuestions;
                }

                showNotification(`Hoàn thành Vấn Đáp. Đã trả lời thêm ${answeredThisSession} câu. Tổng số câu đúng: ${correctCount}/${totalQuestions}`, 'success');

            } catch (e) {
                console.error(`[HH3D Vấn Đáp] ❌ Lỗi xảy ra:`, e);
                showNotification(`Lỗi khi thực hiện Vấn Đáp: ${e.message}`, 'error');
            }
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
    * Lớp quản lý tính năng Đổ Thạch (Dice Roll).
    *
    * Hướng dẫn sử dụng:
    * 1. Tạo một thực thể của lớp, cung cấp các phụ thuộc cần thiết.
    *    const doThachManager = new DoThach();
    *
    * 2. Gọi phương thức run với chiến lược mong muốn ('tài' hoặc 'xỉu').
    *    await doThachManager.run('tài');
    */
    class DoThach {
        constructor() {
            this.ajaxUrl = ajaxUrl;
            this.webUrl = weburl;
            this.getSecurityNonce = getSecurityNonce;
            this.doThachUrl = this.webUrl + 'do-thach-hh3d?t';
        }

        // --- Các phương thức private để gọi API và lấy nonce ---

        async #getLoadDataNonce() {
            return this.getSecurityNonce(this.doThachUrl, /action: 'load_do_thach_data',\s*security: '([a-f0-9]+)'/);
        }

        async #getPlaceBetNonce() {
            return this.getSecurityNonce(this.doThachUrl, /action: 'place_do_thach_bet',\s*security: '([a-f0-9]+)'/);
        }

        async #getClaimRewardNonce() {
            return this.getSecurityNonce(this.doThachUrl, /action: 'claim_do_thach_reward',\s*security: '([a-f0-9]+)'/);
        }

        /**
         * Lấy thông tin phiên đổ thạch hiện tại.
         * @param {string} securityNonce - Nonce cho yêu cầu.
         * @returns {Promise<object|null>} Dữ liệu phiên hoặc null nếu có lỗi.
         */
        async #getDiceRollInfo(securityNonce) {
            console.log('[HH3D Đổ Thạch] ▶️ Đang lấy thông tin phiên...');
            const payload = new URLSearchParams({ action: 'load_do_thach_data', security: securityNonce });
            const headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
            };

            try {
                const response = await fetch(this.ajaxUrl, { method: 'POST', headers, body: payload });
                const data = await response.json();
                if (data.success) {
                    console.log('[HH3D Đổ Thạch] ✅ Tải thông tin phiên thành công.');
                    return data.data;
                }
                console.error('[HH3D Đổ Thạch] ❌ Lỗi từ API:', data.data || 'Lỗi không xác định');
                return null;
            } catch (e) {
                console.error('[HH3D Đổ Thạch] ❌ Lỗi mạng:', e);
                return null;
            }
        }

        /**
         * Đặt cược vào một viên đá cụ thể.
         * @param {object} stone - Đối tượng đá để đặt cược.
         * @param {number} betAmount - Số tiền cược.
         * @param {string} placeBetSecurity - Nonce để đặt cược.
         * @returns {Promise<boolean>} True nếu đặt cược thành công.
         */
        async #placeBet(stone, betAmount, placeBetSecurity) {
            console.log(`[HH3D Đặt Cược] 🪙 Đang cược ${betAmount} Tiên Ngọc vào ${stone.name}...`);
            const payload = new URLSearchParams({
                action: 'place_do_thach_bet',
                security: placeBetSecurity,
                stone_id: stone.stone_id,
                bet_amount: betAmount
            });
            const headers = {
                'Accept': '*/*',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
            };

            try {
                const response = await fetch(this.ajaxUrl, { method: 'POST', headers, body: payload });
                const data = await response.json();

                if (data.success) {
                    showNotification(`✅ Cược thành công vào ${stone.name}!<br>Tỷ lệ <b>x${stone.reward_multiplier}</b>`, 'success');
                    this._alreadyClaimedReward = false; // reset flag
                    return true;
                } 
                else if (data.data === 'Vui lòng nhận thưởng kỳ trước rồi mới tiếp tục đặt cược.') {
                    if (!this._alreadyClaimedReward) {
                        if (await this.#claimReward()) {
                            this._alreadyClaimedReward = true;
                            return await this.#placeBet(stone, betAmount, placeBetSecurity);
                        } else {
                            showNotification(`❌ Không thể nhận thưởng kỳ trước, vui lòng thử lại.`, 'error');
                        }
                    } else {
                        showNotification(`❌ Đã thử nhận thưởng nhưng vẫn không cược được.`, 'error');
                    }
                    this._alreadyClaimedReward = false; // reset flag
                    return false;
                }

                const errorMessage = data.data || data.message || 'Lỗi không xác định.';
                showNotification(`❌ Lỗi cược: ${errorMessage}`, 'error');
                this._alreadyClaimedReward = false;
                return false;
            } catch (e) {
                showNotification(`❌ Lỗi mạng khi cược: ${e.message}`, 'error');
                this._alreadyClaimedReward = false;
                return false;
            }
        }

        /**
         * Nhận thưởng cho một lần cược thắng.
         * @returns {Promise<boolean>} True nếu nhận thưởng thành công.
         */
        async #claimReward() {
            console.log('[HH3D Nhận Thưởng] 🎁 Đang nhận thưởng...');
            const securityNonce = await this.#getClaimRewardNonce();
            if (!securityNonce) {
                showNotification('Lỗi khi lấy nonce để nhận thưởng.', 'error');
                return false;
            }
            const payload = new URLSearchParams({ action: 'claim_do_thach_reward', security: securityNonce });
            const headers = {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest',
            };

            try {
                const response = await fetch(this.ajaxUrl, { method: 'POST', headers, body: payload });
                const data = await response.json();
                if (data.success) {
                    const rewardMessage = data.data?.message || `Nhận thưởng thành công!`;
                    showNotification(rewardMessage, 'success');
                    return true;
                }
                const errorMessage = data.data?.message || 'Lỗi không xác định khi nhận thưởng.';
                showNotification(errorMessage, 'error');
                return false;
            } catch (e) {
                console.error(e);
                showNotification(`❌ Lỗi mạng khi nhận thưởng: ${e.message}`, 'error');
                return false;
            }
        }

        // --- Phương thức public để chạy toàn bộ quy trình ---

        /**
         * Chạy toàn bộ quy trình đổ thạch dựa trên chiến lược đã chọn.
         * @param {string} stoneType - Chiến lược đặt cược ('tài' hoặc 'xỉu').
         */
        async run(stoneType) {
            console.log(`[HH3D Đổ Thạch] 🧠 Bắt đầu quy trình với chiến lược: ${stoneType}...`);

            // Bước 1: Lấy thông tin phiên
            const securityNonce = await this.#getLoadDataNonce();
            if (!securityNonce) {
                showNotification('Lỗi khi lấy nonce để tải dữ liệu.', 'error');
                return;
            }
            const sessionData = await this.#getDiceRollInfo(securityNonce);

            if (!sessionData) {
                console.error('[HH3D Đổ Thạch] ❌ Không thể lấy dữ liệu phiên, dừng lại.');
                return;
            }

            const userBetStones = sessionData.stones.filter(stone => stone.bet_placed);

            // Bước 2: Kiểm tra trạng thái phiên và hành động (nhận thưởng hoặc đặt cược)
            if (sessionData.winning_stone_id) {
                console.log('[HH3D Đổ Thạch] 🎁 Đã có kết quả. Kiểm tra nhận thưởng...');
                const claimableWin = userBetStones.find(s => s.stone_id === sessionData.winning_stone_id && !s.reward_claimed);
                const alreadyClaimed = userBetStones.find(s => s.stone_id === sessionData.winning_stone_id && s.reward_claimed);

                if (claimableWin) {
                    console.log(`[HH3D Đổ Thạch] 🎉 Trúng rồi! Đá cược: ${claimableWin.name}. Đang nhận thưởng...`);
                    await this.#claimReward();
                } else if (alreadyClaimed) {
                    console.log(`[HH3D Đổ Thạch] ✅ Đã nhận thưởng cho phiên này.`);
                } else if (userBetStones.length > 0) {
                    showNotification('[Đổ Thạch] 🥲 Rất tiếc, bạn không trúng phiên này.', 'info');
                } else {
                    showNotification('[Đổ Thạch] 😶 Bạn không tham gia phiên này.', 'info');
                }
                taskTracker.updateTask(accountId, 'dothach', 'reward_claimed', 'true')
                return;
            }

            // Bước 3: Nếu đang trong giờ cược, tiến hành đặt cược
            console.log('[HH3D Đổ Thạch] 💰 Đang trong thời gian đặt cược.');
            const userBetCount = userBetStones.length;

            if (userBetCount >= 2) {
                showNotification('[Đổ Thạch] ⚠️ Đã cược đủ 2 lần. Chờ phiên sau.', 'warn');
                taskTracker.updateTask(accountId, 'dothach', 'betplaced', true);
                return;
            }

            const sortedStones = [...sessionData.stones].sort((a, b) => b.reward_multiplier - a.reward_multiplier);
            const availableStones = sortedStones.filter(stone => !stone.bet_placed);

            if (availableStones.length === 0) {
                showNotification('[Đổ Thạch] ⚠️ Không còn đá nào để cược!', 'warn');
                return;
            }

            const betAmount = 20;
            const stonesToBet = [];
            const normalizedStoneType = stoneType.toLowerCase();
            const betsRemaining = 2 - userBetCount;

            if (normalizedStoneType === 'tài' || normalizedStoneType === 'tai') {
                stonesToBet.push(...availableStones.slice(0, betsRemaining));
            } else if (normalizedStoneType === 'xỉu' || normalizedStoneType === 'xiu') {
                const xiuStones = availableStones.slice(2, 4);
                stonesToBet.push(...xiuStones.slice(0, betsRemaining));
            } else {
                console.log('[HH3D Đổ Thạch] ❌ Chiến lược không hợp lệ. Vui lòng chọn "tài" hoặc "xỉu".');
                return;
            }

            if (stonesToBet.length === 0) {
                console.log('[HH3D Đổ Thạch] ⚠️ Không có đá nào phù hợp chiến lược hoặc đã cược đủ.');
                return;
            }

            const placeBetSecurity = await this.#getPlaceBetNonce();
            if (!placeBetSecurity) {
                showNotification('Lỗi khi lấy nonce để đặt cược.', 'error');
                return;
            }

            let successfulBets = 0;
            for (const stone of stonesToBet) {
                const success = await this.#placeBet(stone, betAmount, placeBetSecurity);
                if (success) {
                    successfulBets++;
                }
            }

            // Kiểm tra và cập nhật trạng thái ngay sau khi cược
            if (userBetCount + successfulBets >= 2) {
                taskTracker.updateTask(accountId, 'dothach', 'betplaced', true);
            }
        }
    }
    // ===============================================
    // THÍ LUYỆN TÔNG MÔN
    // ===============================================

    async function doThiLuyenTongMon() {
        console.log('[HH3D Thí Luyện Tông Môn] ▶️ Bắt đầu Thí Luyện Tông Môn');

        // Bước 1: Lấy security nonce.
        const securityNonce = await getSecurityNonce(weburl + 'thi-luyen-tong-mon-hh3d?t', /action: 'open_chest_tltm',\s*security: '([a-f0-9]+)'/);
        if (!securityNonce) {
            showNotification('Lỗi khi lấy security nonce cho Thí Luyện Tông Môn.', 'error');
            throw new Error('Lỗi khi lấy security nonce cho Thí Luyện Tông Môn.');
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
                showNotification(message, 'success');
            } else {
                // Trường hợp thất bại
                if (data.data.message === "Đã hoàn thành Thí Luyện Tông Môn hôm nay, quay lại vào ngày kế tiếp.") {
                    showNotification(data.data.message, 'info');
                    taskTracker.markTaskDone(accountId, 'thiluyen');
                } else {
                    showNotification(data.data.message, 'error');
                }
            };

            const timeResponse = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: `action=get_remaining_time_tltm&security=${securityNonce}`,
                credentials: 'include'
            });

            const timeResponseData = await timeResponse.json();
            if (timeResponseData.success) {
                taskTracker.adjustTaskTime(accountId, 'thiluyen', timePlus(timeResponseData.data.time_remaining));
            }

        } catch (e) {
            showNotification(`Lỗi mạng khi thực hiện Thí Luyện: ${e.message}`, 'error');
        }
    }

    // ===============================================
    // PHÚC LỢI
    // ===============================================
    async function doPhucLoiDuong() {
        console.log('[HH3D Phúc Lợi Đường] ▶️ Bắt đầu nhiệm vụ Phúc Lợi Đường.');

        // Bước 1: Lấy security nonce từ trang Phúc Lợi Đường
        const securityNonce = await getSecurityNonce(weburl + 'phuc-loi-duong?t', /action: 'get_next_time_pl',\s*security: '([a-f0-9]+)'/);
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

                // Return khi mở đủ 4 chest
                if (chest_level >= 4) {
                    showNotification('Phúc Lợi Đường đã hoàn tất hôm nay!', 'success');
                    taskTracker.markTaskDone(accountId, 'phucloi');
                    return;
                }

                if (time === '00:00') {
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
                        if (message.includes('đã hoàn thành Phúc Lợi ngày hôm nay')) {
                            taskTracker.markTaskDone(accountId, 'phucloi');
                        } else taskTracker.adjustTaskTime(accountId,'phucloi', timePlus('30:00'));  //30 phút cho lần mở rương tiếp theo
                    } else {
                        const errorMessage = dataOpen.data && dataOpen.data.message ? dataOpen.data.message : 'Lỗi không xác định khi mở rương.';
                        showNotification(errorMessage, 'error');
                    }
                } else {
                    // Trường hợp còn thời gian
                    showNotification(`Vui lòng đợi ${time} để mở rương tiếp theo.`, 'warn');
                    taskTracker.adjustTaskTime(accountId,'phucloi', timePlus(time));
                };
            } else {
                const errorMessage = dataTime.data && dataTime.data.message ? dataTime.data.message : 'Lỗi không xác định khi lấy thời gian.';
                showNotification(errorMessage, 'error');
            }
        } catch (e) {
            showNotification(`Lỗi mạng khi thực hiện Phúc Lợi Đường: ${e.message}`, 'error');
        }
    }

    // ===============================================
    // BÍ CẢNH
    // ===============================================
    class BiCanh {
        constructor() {
            this.weburl = weburl;
            this.logPrefix = '[HH3D Bí Cảnh]';
        }

        /**
         * Phương thức chính để thực hiện toàn bộ nhiệm vụ Bí Cảnh.
         */
        async doBiCanh() {
            console.log(`${this.logPrefix} ▶️ Bắt đầu nhiệm vụ Bí Cảnh Tông Môn.`);

            // Bước 1: Lấy Nonce bảo mật
            const nonce = await this.getNonce();
            if (!nonce) {
                showNotification('Lỗi: Không thể lấy nonce cho Bí Cảnh Tông Môn.', 'error');
                throw new Error ('Lỗi nonce bí cảnh');
            }

            // Bước 2: Kiểm tra thời gian hồi
            const canAttack = await this.checkAttackCooldown(nonce);
            if (!canAttack) {
                return true;
            }

            // Bước 3: Tấn công boss Bí Cảnh
            await this.attackBoss(nonce);
        }

        /**
         * Lấy nonce từ trang Bí Cảnh Tông Môn.
         * @returns {Promise<string|null>} Nonce bảo mật hoặc null nếu lỗi.
         */
        async getNonce() {
            const nonce = await getSecurityNonce(weburl + 'bi-canh-tong-mon?t', /"nonce":"([a-f0-9]+)"/);
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
                    if (response.remaining_attacks === 5) {
                        const rewardResponse = await this.sendApiRequest('wp-json/tong-mon/v1/claim-boss-reward', 'POST', nonce, {});
                        if (rewardResponse && rewardResponse.success) {
                            showNotification(rewardResponse.message, 'success');
                        }
                    }
                    console.log(`${this.logPrefix} ✅ Có thể tấn công.`);
                    return true;
                }
                // Kiểm tra trường hợp boss chết: Nhận thưởng và hiến tế
                else if (response.success && response.message === 'Không có boss để tấn công') {
                    const rewardResponse = await this.sendApiRequest('wp-json/tong-mon/v1/claim-boss-reward', 'POST', nonce, {});
                    if (rewardResponse && rewardResponse.success) {
                        showNotification(rewardResponse.message, 'success')
                    };
                    const contributionResponse = await this.sendApiRequest('wp-json/tong-mon/v1/contribute-boss', 'POST', nonce, {});
                    if (contributionResponse) {
                        if (contributionResponse.success) {showNotification(contributionResponse.message, 'success')}
                        else {showNotification(contributionResponse.message, 'warn')}
                    } else
                    return false;
                }
                else {
                    if (response && response.success && response.cooldown_remaining) {
                        taskTracker.adjustTaskTime(accountId, 'bicanh', Date.now()+ response.cooldown_remaining*1000)
                    }
                    const message = response?.message || 'Không thể tấn công vào lúc này.';
                    showNotification(`⏳ ${message}`, 'info');
                    return false;
                }
            } catch (e) {
                showNotification(`${this.logPrefix} ❌ Lỗi kiểm tra cooldown: ${e.message}`, 'error');
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
                    showNotification(message, 'success');
                    taskTracker.adjustTaskTime(accountId, 'bicanh', timePlus('07:00'));
                } else {
                    const errorMessage = response?.message || 'Lỗi không xác định khi tấn công.';
                    showNotification(errorMessage, 'error');
                }
            } catch (e) {
                showNotification(`Lỗi mạng khi tấn công boss Bí Cảnh: ${e.messeage}`, 'error');
            }
        }


        /**  Kiểm tra xem có đạt giới hạn tấn công hàng ngày hay không.
         * @returns {Promise<boolean>} True nếu đạt giới hạn, ngược lại là false.
         * */
        async isDailyLimit() {
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
            const url = weburl + 'hoang-vuc?t';
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
         * @param {string} bossId - ID của boss cần tấn công.
         * @param {string} nonce - Nonce bảo mật.
         * @returns {Promise<boolean>} `True` nếu tấn công thành công, ngược lại là `false`.
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
                return true
            } else if (data.data.error === 'Đạo hữu đã hết lượt tấn công trong ngày.') {
                taskTracker.markTaskDone(accountId, 'hoangvuc');
                showNotification('Đạo hữu đã hết lượt tấn công trong ngày.', 'info');
                return true;
            }
            else {
                const errorMessage = data.data.error || 'Lỗi không xác định khi tấn công.';
                showNotification(errorMessage, 'error');
                return false;
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
        };

        async getNonceAndRemainingAttacks(url) {
            const logPrefix = '[Hoang Vực]';
                console.log(`${logPrefix} ▶️ Đang tải trang từ ${url}...`);
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const html = await response.text();

                    // Regex 1: lấy số lượt đánh
                    const attacksMatch = html.match(/<div class="remaining-attacks">Lượt đánh còn lại:\s*(\d+)<\/div>/);
                    const remainingAttacks = attacksMatch ? parseInt(attacksMatch[1], 10) : null;

                    // Regex 2: lấy nonce
                    const nonceMatch = html.match(/var ajax_boss_nonce = '([a-f0-9]+)'/);
                    const nonce = nonceMatch ? nonceMatch[1] : null;

                    console.log(`${logPrefix} ✅ Lấy dữ liệu thành công.`);
                    return { remainingAttacks, nonce };

                } catch (e) {
                    console.error(`${logPrefix} ❌ Lỗi khi tải trang hoặc trích xuất dữ liệu:`, e);
                    return { remainingAttacks: null, nonce: null };
                }
            }


        /**
         * Hàm chính để tự động hóa Hoang Vực.
         */
        async doHoangVuc(maximizeDamage = true) {
            console.log(`${this.logPrefix} ▶️ Bắt đầu nhiệm vụ với chiến lược: ${maximizeDamage ? 'Tối đa hóa Sát thương' : 'Không giảm Sát thương'}.`);

            const hoangVucUrl = `${weburl}hoang-vuc?t`;
            const { remainingAttacks, nonce } = await this.getNonceAndRemainingAttacks(hoangVucUrl);

            if (!nonce) {
                showNotification('Lỗi: Không thể lấy nonce cho Hoang Vực.', 'error');
                throw new Error("Không lấy được nonce");
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

                    if (boss.has_pending_rewards) {
                        await this.claimHoangVucRewards(nonce);
                        return this.doHoangVuc(maximizeDamage);
                    } else if (boss.created_date === new Date().toISOString().slice(0, 10) && boss.health === boss.max_health) {
                        taskTracker.markTaskDone(accountId, 'hoangvuc');
                        return true;
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
                        // Thực hiện tấn công boss Hoang Vực, nếu thành công và còn 1 lượt tấn công thì đánh dấu nhiệm vụ hoàn thành
                        if (await this.attackHoangVucBoss(boss.id, nonce)){
                            taskTracker.adjustTaskTime(accountId, 'hoangvuc', timePlus('15:02'));   //--------- 15 phút cho lần sau -----------//
                            if (this.remainingAttacks <= 1) {
                            taskTracker.markTaskDone(accountId, 'hoangvuc');
                            };
                        };
                    } else {
                        const remainingTime = nextAttackTime.data - Date.now();
                        const remainingSeconds = Math.floor(remainingTime / 1000);
                        const minutes = Math.floor(remainingSeconds / 60);
                        const seconds = remainingSeconds % 60;
                        const message = `⏳ Cần chờ <b>${minutes} phút ${seconds} giây</b> để tấn công tiếp.`; ///////////////////
                        showNotification(message, 'info');
                        taskTracker.adjustTaskTime(accountId, 'hoangvuc', nextAttackTime.data);
                    }
                } else {
                    const errorMessage = bossInfoData.message || 'Lỗi không xác định khi lấy thông tin boss.';
                    showNotification(errorMessage, 'error');
                }
            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi mạng:`, e);
                showNotification(e.message, 'error');
                throw e;
            }
        }
    }

    // ===============================================
    // LUẬN VÕ
    // ===============================================

    class LuanVo {
        constructor() {
            this.weburl = weburl;
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

                const contentType = response.headers.get("content-type");
                let data = null;
                if (contentType && contentType.includes("application/json")) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }

                if (!response.ok) {
                    // vẫn trả về JSON để caller xử lý
                    console.warn(`${this.logPrefix} ⚠️ API trả về lỗi ${response.status}:`, data);
                    return data;
                }

                return data;
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
         * Lấy danh sách tất cả user đang theo dõi
         * Gồm các phần: id, name, avatar, points, auto_accept, can_receive_count, profile_link, role, role_color, description, challenges_remaining, challenge_exists, challenge_id, is_following, is_joined_today, can_send_count, max_batch_count
         */
        async getFollowingUsers(nonce) {
            console.log(`${this.logPrefix} 🕵️ Đang lấy danh sách người theo dõi...`);
            const endpoint = 'wp-json/luan-vo/v1/get-following-users';
            const body = { page: 1 };
            const data = await this.sendApiRequest(endpoint, 'POST', nonce, body);

            if (data && data.success) {
                console.log(`${this.logPrefix} ✅ Lấy danh sách thành công. Tìm thấy ${data.data.users.length} người dùng.`);
                return data.data.users
            } else {
                const message = data?.message || 'Lỗi không xác định khi lấy danh sách người theo dõi.';
                console.error(`${this.logPrefix} ❌ ${message}`);
                return null;
            }
        };

        /**
         * Lấy danh sách tất cả user đang theo dõi
         * Gồm các phần: id, name, avatar, points, auto_accept, can_receive_count, profile_link, role, role_color, description, challenges_remaining, challenge_exists, challenge_id, is_following, is_joined_today, can_send_count, max_batch_count
         */
        async  getOnlineUsers(nonce) {
            console.log("🟢 Đang lấy danh sách người dùng online...");
            const endpoint = 'wp-json/luan-vo/v1/online-users';
            const body = { page: 1 };

            const data = await this.sendApiRequest(endpoint, 'POST', nonce, body);
            if (data && data.success) {
                console.log(`✅ Lấy danh sách thành công. Tìm thấy ${data.data.users.length} người online.`);
                return data.data.users; // trả nguyên danh sách
            } else {
                const message = data?.message || "Lỗi không xác định khi lấy danh sách người dùng online.";
                console.error(`❌ ${message}`);
                return null;
            };
        };

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
                        showNotification(`[Luận võ] ${approveResult.data.message}!`, 'success');
                        return true;
                    } else {
                        const message = approveResult?.data?.message || 'Lỗi không xác định khi hoàn tất trận đấu.';
                        showNotification(`❌ Lỗi hoàn tất trận đấu: ${message}`, 'error');
                        return false;
                    }
                } else {
                    showNotification(`✅ Đã gửi khiêu chiến đến ${userId}! Đang chờ đối thủ chấp nhận.`, 'success');
                    return true;
                }
            } else {
                const message = sendResult?.data?.message || 'Lỗi không xác định.';
                showNotification(`❌ Gửi khiêu chiến thất bại: ${message}`, 'error');
                return false;
            }
        }

        /**
         * Hiện hộp thoại và chuyển hướng đến trang Luận Võ trên tab hiện tại.
         */
        async goToLuanVoPage() {
            const luanVoUrl = `${weburl}/luan-vo-duong?t`;

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
                const response = await this.sendApiRequest(endpoint, 'POST', nonce, body);
                if (!response) {
                    return;
                }
                if (response.success === true) {
                    showNotification(`🎉 Luận võ: ${response.message}`, 'success');
                    taskTracker.markTaskDone(accountId, 'luanvo');
                    return;
                } else if (response.message === "Đạo hữu đã nhận thưởng trong ngày hôm nay.") {
                    showNotification('🎁 Bạn đã nhận thưởng Luận Võ hôm nay rồi!', 'info')
                    taskTracker.markTaskDone(accountId, 'luanvo');
                    return;
                } else {
                    const errorMessage = response.message || 'Lỗi không xác định khi nhận thưởng.';
                    showNotification(`❌ ${errorMessage}`, 'error');
                }
            } catch (error) {
                showNotification(`❌ Lỗi mạng khi gửi yêu cầu nhận thưởng. ${error}`, 'error');
            }
        }
        /**
         * Hàm chính: Chạy toàn bộ quy trình Luận Võ.
         * @param {string} nonce - Nonce bảo mật.
         * @param {function} getNonce - Hàm để lấy nonce từ trang web.
         * @param {function} showNotification- Hàm để hiển thị thông báo.
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
            if (!taskTracker.getTaskStatus(accountId, 'luanvo').battle_joined){
                const joinResult = await this.sendApiRequest(
                    'wp-json/luan-vo/v1/join-battle', 'POST', nonce, {}
                );
            console.log(`✅ Tham gia luận võ thành công.`);
            }


            // Bước 3: Đảm bảo tự động chấp nhận khiêu chiến
            if (!taskTracker.getTaskStatus(accountId, 'luanvo').auto_accept){
                const autoAcceptSuccess = await this.ensureAutoAccept(nonce);
                if (!autoAcceptSuccess) {
                    showNotification('⚠️ Tham gia thành công nhưng không thể bật tự động chấp nhận.', 'warning');
                } else {
                    console.log(`${this.logPrefix} ✅ Tự động chấp nhận đã được bật.`);
                }
            }
            // Bước 4: Khiêu chiến người chơi
            if (!autoChallenge) {
                //Hiện hộp thoại thông báo để người chơi tới trang luận võ thủ công
                this.goToLuanVoPage();
                return;
            }

            // Vòng lặp gửi khiêu chiến
            let challengesSent = 0;
            let shouldAttackOnline = false;

            while (true) {
                let allFollowingUsers = await this.getFollowingUsers(nonce);
                let myCanSend = allFollowingUsers[0]?.can_send_count ?? 0;

                if (myCanSend <= 0) break;

                // Lọc những user có thể khiêu chiến (auto_accept + còn lượt)
                let canChallengeUsers = allFollowingUsers.filter(u => u.auto_accept && u.can_receive_count > 0);

                if (canChallengeUsers.length > 0) {
                    // Khiêu chiến user đầu tiên
                    const success = await this.sendChallenge(canChallengeUsers[0].id, nonce);
                    if (success) {
                        challengesSent++;
                        myCanSend--;
                        await this.delay(4500);
                    }
                    continue; // quay lại kiểm tra following
                }

                // Nếu không còn ai có auto_accept, kiểm tra những người còn lượt
                let canReceiveUsers = allFollowingUsers.filter(u => u.can_receive_count > 0);

                if (canReceiveUsers.length === 0) {
                    shouldAttackOnline = true;
                }

                // Nếu không còn ai để khiêu chiến từ following và user đồng ý, tấn công online
                if (shouldAttackOnline) {
                    const attackOnline = confirm('Dnah sách theo dõi không còn ai khiêu chiến được, tiến hành khiêu chiến người chơi online?');
                    if (!attackOnline) break;

                    while (myCanSend > 0) {
                        let allOnlineUsers = await this.getOnlineUsers(nonce);
                        if (!allOnlineUsers || allOnlineUsers.length === 0) break;

                        const success = await this.sendChallenge(allOnlineUsers[0].id, nonce);
                        if (success) {
                            challengesSent++;
                            myCanSend--;
                            await this.delay(4500);
                        }
                    }
                    break; // xong tấn công online, thoát vòng lặp
                }

                // Nếu vẫn còn lượt nhưng không ai để khiêu chiến, dừng vòng lặp
                if (myCanSend <= 0) break;
            }

            showNotification(`✅ Hoàn thành! Đã gửi ${challengesSent} khiêu chiến.`, 'success');

            // Bước 5: Nhận thưởng nếu có
            const rewardResult = await this.receiveReward(nonce);
        }
    };

    class KhoangMach {
        constructor() {
            this.ajaxUrl = ajaxUrl;
            this.khoangMachUrl = weburl + 'khoang-mach?t';
            this.logPrefix = '[Khoáng Mạch]';
            this.headers = {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            };
        }

        async #getNonce(regex) {
            return getSecurityNonce(this.khoangMachUrl, regex);
        }


        async loadMines(mineType) {
            const nonce = await getSecurityNonce(this.khoangMachUrl, /action:\s*'load_mines_by_type',\s*mine_type:\s*mineType,\s*security:\s*'([a-f0-9]+)'/);
            if (!nonce) { showNotification('Lỗi nonce (load_mines).', 'error'); return null; }
            const payload = new URLSearchParams({ action: 'load_mines_by_type', mine_type: mineType, security: nonce });
            try {
                const r = await fetch(this.ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                const d = await r.json();
                return d.success ? d.data : (showNotification(d.message || 'Lỗi tải mỏ.', 'error'), null);
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (tải mỏ):`, e); return null; }
        };

        async getAllMines() {
            const cacheKey = "HH3D_allMines";
            const cacheRaw = localStorage.getItem(cacheKey);

            // Kiểm tra cache
            if (cacheRaw) {
                try {
                    const cache = JSON.parse(cacheRaw);
                    if (Date.now() < cache.expiresAt) {
                        console.log("[HH3D] 🗄️ Dùng dữ liệu mỏ từ cache");
                        return {
                            optionsHtml: cache.optionsHtml,
                            minesData: cache.data
                        };
                    }
                } catch (e) {
                    console.warn("[HH3D] Lỗi đọc cache:", e);
                }
            }

            // --- Nếu chưa có cache hoặc đã hết hạn, tải mới ---
            const nonce = await getSecurityNonce(
                this.khoangMachUrl,
                /action:\s*'load_mines_by_type',\s*mine_type:\s*mineType,\s*security:\s*'([a-f0-9]+)'/
            );
            if (!nonce) {
                showNotification('Lỗi nonce (getAllMines).', 'error');
                return { optionsHtml: '', minesData: [] };
            }

            const mineTypes = ['gold', 'silver', 'copper'];
            const allMines = [];

            // Tải song song cho nhanh
            const requests = mineTypes.map(async type => {
                const payload = new URLSearchParams({
                    action: 'load_mines_by_type',
                    mine_type: type,
                    security: nonce
                });

                try {
                    const r = await fetch(this.ajaxUrl, {
                        method: 'POST',
                        headers: this.headers,
                        body: payload,
                        credentials: 'include'
                    });
                    const d = await r.json();

                    if (d.success) {
                        d.data.forEach(mine => {
                            mine.type = type;
                            allMines.push(mine);
                        });
                    } else {
                        showNotification(d.message || `Lỗi tải mỏ loại ${type}.`, 'error');
                    }
                } catch (e) {
                    console.error(`${this.logPrefix} ❌ Lỗi mạng (tải mỏ ${type}):`, e);
                }
            });

            await Promise.all(requests);

            // --- Sắp xếp ---
            allMines.sort((a, b) => {
                const typeOrder = { 'gold': 1, 'silver': 2, 'copper': 3 };
                const typeComparison = typeOrder[a.type] - typeOrder[b.type];
                if (typeComparison === 0) {
                    return a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
                }
                return typeComparison;
            });

            // --- Sinh HTML ---
            const mineOptionsHtml = allMines.map(mine => {
                let typePrefix = '';
                if (mine.type === 'gold') typePrefix = '[Thượng] ';
                else if (mine.type === 'silver') typePrefix = '[Trung] ';
                else if (mine.type === 'copper') typePrefix = '[Hạ] ';
                return `<option value="${mine.id}">${typePrefix}${mine.name} (${mine.id})</option>`;
            }).join('');

            // --- Tính thời điểm 0h hôm sau ---
            const now = new Date();
            const expireDate = new Date(now);
            expireDate.setHours(24, 0, 0, 0); // 0h ngày hôm sau
            const expiresAt = expireDate.getTime();

            // --- Lưu cache ---
            localStorage.setItem(cacheKey, JSON.stringify({
                data: allMines,
                optionsHtml: mineOptionsHtml,
                expiresAt
            }));

            return {
                optionsHtml: mineOptionsHtml,
                minesData: allMines
            };
        }


        async enterMine(mineId) {
            // Lấy nonce
            const [nonce1, nonce2] = await Promise.all([
                this.#getNonce(/action: 'enter_mine',\s*mine_id:\s*mine_id,\s*security: '([a-f0-9]+)'/),
                this.#getNonce(/var security_km = '([a-f0-9]+)'/)
            ]);

            if (!nonce1 || !nonce2) {
                showNotification('Lỗi nonce (enter_mine).', 'error');
                return false;
            }

            // Hàm gửi request
            const post = async (payload) => {
                const r = await fetch(this.ajaxUrl, {
                    method: 'POST',
                    headers: this.headers,
                    body: new URLSearchParams(payload),
                    credentials: 'include'
                });
                return r.json();
            };

            try {
                const d = await post({ action: 'enter_mine', mine_id: mineId, security: nonce1, security_km: nonce2 });

                if (d.success) {
                    showNotification(d.data.message, 'success');
                    return true;
                }

                const msg = d.data.message || 'Lỗi vào mỏ.';

                if (msg.includes('đạt đủ thưởng ngày')) {
                    taskTracker.markTaskDone(accountId, 'khoangmach');
                    showNotification(msg, 'error');
                } 
                else if (msg.includes('Có phần thưởng chưa nhận')) {
                    // Nếu bị sát hại tại khoáng mạch → nhận thưởng trước
                    const nonce = await this.#getNonce(/action: 'claim_reward_km',\s*security: '([a-f0-9]+)'/);
                    if (!nonce) {
                        showNotification('Lỗi nonce (claim_reward_km).', 'error');
                        return false;
                    }

                    const reward = await post({ action: 'claim_reward_km', security: nonce });
                    if (reward.success) {
                        showNotification(`Nhận thưởng <b>${reward.data.total_tuvi} tu vi và ${reward.data.total_tinh_thach} tinh thạch</b> tại khoáng mạch ${reward.data.mine_name}`, 'info');
                        return this.enterMine(mineId); // gọi lại để vào mỏ
                    } else {
                        showNotification('Lỗi nhận thưởng khi bị đánh ra khỏi mỏ khoáng', 'warn');
                    }
                }

            } catch (e) {
                console.error(`${this.logPrefix} ❌ Lỗi mạng (vào mỏ):`, e);
                return false;
            }
        }



        async getUsersInMine(mineId) {
            const nonce = await this.#getNonce(/action: 'get_users_in_mine',\s*mine_id:\s*mine_id,\s*security: '([a-f0-9]+)'/);
            if (!nonce) { showNotification('Lỗi nonce (get_users).', 'error'); return null; }
            const payload = new URLSearchParams({ action: 'get_users_in_mine', mine_id: mineId, security: nonce });
            try {
                const r = await fetch(this.ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                const d = await r.json();
                return d.success ? d.data : (showNotification(d.message || 'Lỗi lấy thông tin người chơi.', 'error'), null);
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (lấy user):`, e); return null; }
        }
        
        async takeOverMine(mineId) {
            const nonce = await this.#getNonce(/action: 'change_mine_owner',\s*mine_id:\s*mineId,\s*security: '([a-f0-9]+)'/);
            if (!nonce) { showNotification('Lỗi nonce (take_over).', 'error'); return false; }
            const payload = new URLSearchParams({ action: 'change_mine_owner', mine_id: mineId, security: nonce });
            try {
                const r = await fetch(this.ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                const d = await r.json();
                if (d.success) {
                    showNotification(d.data.message, 'success');
                    return true;
                } else {
                    showNotification(d.message || 'Lỗi đoạt mỏ.', 'error');
                    return false;
                }
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (đoạt mỏ):`, e); return false; }
        }

        async buyBuffItem() {
            const nonce = await this.#getNonce(/action: 'buy_item_khoang',\s*security: '([a-f0-9]+)'/);
            if (!nonce) { showNotification('Lỗi nonce (buy_item).', 'error'); return false; }
            const payload = new URLSearchParams({ action: 'buy_item_khoang', security: nonce, item_id: 4 });
            try {
                const r = await fetch(this.ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                const d = await r.json();
                if (d.success) {
                    showNotification(d.data.message || 'Đã mua Linh Quang Phù', 'success');
                    return true;
                } else {
                    showNotification(d.data.message || 'Lỗi mua Linh Quang Phù', 'error');
                    return false;
                }
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (mua buff):`, e); return false; }
        }

        async claimReward(mineId) {
            const nonce = await this.#getNonce(/action: 'claim_mycred_reward',\s*mine_id:\s*mine_id,\s*security: '([a-f0-9]+)'/);
            if (!nonce) { showNotification('Lỗi nonce (claim_reward).', 'error'); return false; }
            const payload = new URLSearchParams({ action: 'claim_mycred_reward', mine_id: mineId, security: nonce });
            try {
                const r = await fetch(this.ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                const d = await r.json();
                if (d.success) {
                    showNotification(d.data.message, 'success');
                    taskTracker.adjustTaskTime(accountId, 'khoangmach', timePlus('30:00'));
                    return true;
                } else {
                    showNotification(d.data.message || 'Lỗi nhận thưởng.', 'error');
                    return false;
                }
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (nhận thưởng):`, e); return false; }
        }

        async doKhoangMach() {
            const selectedMineSetting = localStorage.getItem('khoangmach_selected_mine');
            if (!selectedMineSetting) {
                showNotification('Vui lòng chọn một mỏ trong cài đặt.', 'error');
                throw new Error ('Bạn chưa chọn mỏ');
            }

            const selectedMineInfo = JSON.parse(selectedMineSetting);
            if (!selectedMineInfo || !selectedMineInfo.id || !selectedMineInfo.type) {
                showNotification('Cài đặt mỏ không hợp lệ.', 'error');
                throw new Error ('Cài đặt mỏ không hợp lệ.');
            }

            const useBuff = localStorage.getItem('khoangmach_use_buff') === 'true';
            const autoTakeover = localStorage.getItem('khoangmach_auto_takeover') === 'true';
            const autoTakeoverRotation = localStorage.getItem('khoangmach_auto_takeover_rotation') === 'true';
            const rewardMode = localStorage.getItem('khoangmach_reward_mode');

            console.log(`${this.logPrefix} Bắt đầu quy trình cho mỏ ID: ${selectedMineInfo.id}.`);
            const mines = await this.loadMines(selectedMineInfo.type);
            if (!mines) throw new Error ('Không tải danh sách khoáng mạch được');

            const targetMine = mines.find(m => m.id === selectedMineInfo.id);
            if (!targetMine) {
                showNotification('Không tìm thấy mỏ đã chọn trong danh sách tải về.', 'error');
                throw new Error ('Không tìm thấy mỏ đã chọn trong danh sách.');
            }
            if (!targetMine.is_current) {
                if (parseInt(targetMine.user_count) >= parseInt(targetMine.max_users)) {
                    showNotification('Mỏ đã đầy. Không vào được.', 'warn');
                    return true;
                } else {
                    await this.enterMine(targetMine.id);
                    return true;
                }
            }

            // Bắt đầu vòng lặp để kiểm tra và thực hiện tác vụ liên tục
            while (true) {
                // Kiểm tra thông tin trong mỏ
                let mineInfo = await this.getUsersInMine(targetMine.id);
                if (!mineInfo) throw new Error('Lỗi lấy thông tin chi tiết trong mỏ');
                const users = mineInfo.users || [];
                if (users.length === 0) {
                    console.log(`[Khoáng mạch] Mỏ ${targetMine.id} trống.`);
                    throw new Error('Mỏ trống trơn???');
                }

                // Kiểm tra ngoại tông
                let outer = users.some(u => !u.lien_minh && !u.dong_mon);
                if (outer) {
                    if (confirm('Ngoại tông xâm nhập khoáng mạch, \n Bạn có muốn đến khoáng mạch?')){
                        window.location.href = this.khoangMachUrl;
                        break;
                    }
                }

                // Kiểm tra vị trí trong mỏ
                let myIndex = users.findIndex(u => u.id.toString() === accountId.toString());
                if (myIndex === -1) {
                    console.log(`[Khoáng mạch] Kiểm tra vị trí. Bạn chưa vào mỏ ${targetMine.name}.`);
                    return;
                }

                let myInfo = users[myIndex];
                console.log(`[Khoáng mạch] Vị trí: ${myIndex}, Tên: ${myInfo.name}, Time: ${myInfo.time_spent}`);

                // Kiểm tra thời gian
                if (myInfo.time_spent !== "Đạt tối đa") {
                    const nextTime = Date.now() + Math.max(
                        30*60*1000 - (
                            (/phút/.test(myInfo.time_spent) ? parseInt(myInfo.time_spent)*60 : 0) +
                            (/giây/.test(myInfo.time_spent) ? parseInt(myInfo.time_spent) : 0)
                        ) * 1000,
                        0
                    );
                    taskTracker.adjustTaskTime(accountId, 'khoangmach', nextTime);
                    showNotification(`Khoáng mạch chưa đủ thời gian.<br>Hiện đạt: <b>${myInfo.time_spent}</b>`, 'warn');
                    // Có thể thêm delay để tránh spam server
                    break;
                }

                // Kiểm tra trạng thái bonus
                let bonus = mineInfo.bonus_percentage || 0;
                let canClaim = false;
                if (rewardMode === "any") {
                    canClaim = true;
                } else if (rewardMode === ">0" && bonus > 0) {
                    canClaim = true;
                } else if (rewardMode === ">50" && bonus > 50) {
                    canClaim = true;
                } else if (rewardMode === "110" && bonus === 110) {
                    canClaim = true;
                }

                if (canClaim) {
                    console.log(`[Khoáng mạch] Nhận thưởng tại mỏ ${targetMine.id}, bonus=${bonus}%`);
                    await this.claimReward(targetMine.id);  // Nhận thưởng
                    break; // Thoát vòng lặp sau khi nhận thưởng
                } else {
                    console.log(`[Khoáng mạch] Bonus tu vi ${bonus}% chưa đạt ngưỡng ${rewardMode}`);
                    
                    // Nếu có thể, thử takeover trước (option đoạt mỏ khi chưa buff)
                    if (autoTakeover && mineInfo.can_takeover) {
                        console.log(`[Khoáng mạch] Thử đoạt mỏ ${targetMine.id}...`);
                        await this.takeOverMine(targetMine.id);
                        continue;
                    }

                    // Nếu có thể, thử takeover trước (option đoạt mỏ bất kể buff)
                    if (autoTakeoverRotation && mineInfo.can_takeover) {
                        console.log(`[Khoáng mạch] Thử đoạt mỏ ${targetMine.id}...`);
                        await this.takeOverMine(targetMine.id);
                        continue;
                    }

                    // Nếu không thể takeover và có bật buff
                    if (useBuff && bonus > 0 && mineInfo.is_mine_owner) {
                        console.log(`[Khoáng mạch] Mua linh quang phù...`);
                        await this.buyBuffItem(targetMine.id);
                        // Đợi một chút để server xử lý
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }

                    // Nếu không thể làm gì, thoát khỏi vòng lặp
                    console.log(`[Khoáng mạch] Không thể thực hiện thêm hành động nào. Thoát vòng lặp.`);
                    break;
                }
            }
        }
    }

    //===================================
    // TIÊN DUYÊN
    //===================================
    class TienDuyen {
        nonce;
        constructor() {
            this.apiUrl = weburl + "wp-json/hh3d/v1/action";
        }
        async init() {
                this.nonce = await getNonce();  // Await và gán ở đây
            }
        async #post(action, body = {}) {
            const res = await fetch(this.apiUrl, {
                credentials: "include",
                method: "POST",
                headers: {
                    "Accept": "*/*",
                    "Content-Type": "application/json",
                    "X-WP-Nonce": this.nonce
                },
                body: JSON.stringify({ action, ...body })
            });
            return res.json();
        }

        // Lấy danh sách phòng cưới
        async getWeddingRooms() {
            return await this.#post("show_all_wedding", {});
        }

        // Chúc phúc
        async addBlessing(weddingRoomId, message = "Chúc phúc trăm năm hạnh phúc 🎉") {
            return await this.#post("hh3d_add_blessing", {
                wedding_room_id: weddingRoomId,
                message
            });
        }

        // Nhận lì xì
        async receiveLiXi(weddingRoomId) {
            return await this.#post("hh3d_receive_li_xi", {
                wedding_room_id: weddingRoomId
            });
        }

        // Duyên: chúc phúc + nhận lì xì
        async doTienDuyen() {
            const lastCheck = taskTracker.getLastCheckTienDuyen(accountId);
            const now = new Date();
            if (now - lastCheck < 1800000) return;

            const list = await this.getWeddingRooms();
            if (!list?.data) {
                showNotification("Không có danh sách phòng cưới", 'warn');
                return;
            }

            for (const room of list.data) {
                taskTracker.setLastCheckTienDuyen(accountId, now)
                console.log(`👉 Kiểm tra phòng ${room.wedding_room_id}`);

                if (room.has_blessed === false) {
                    const bless = await this.addBlessing(room.wedding_room_id);
                    if (bless && bless.success === true) {
                        showNotification(`Bạn đã gửi lời chúc phúc cho cặp đôi <br><b>${room.user1_name} 💞 ${room.user2_name}</b>`, 'success')
                    }
                }

                if (room.has_li_xi === true) {
                    const liXi = await this.receiveLiXi(room.wedding_room_id);
                    if (liXi && liXi.success === true) {
                        showNotification(`Nhận lì xì phòng cưới ${room.wedding_room_id} được <b>${liXi.data.amount} ${liXi.data.name}</b>!`, 'success')
                    }
                }
            }
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
                  background-color: white;
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
        if (/<[a-z][\s\S]*>/i.test(message)) {
            notification.innerHTML = message; // có HTML
        } else {
            notification.innerText = message; // chỉ text
        }

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
    // Class quản lý các quy tắc CSS
    // ===============================================
    class UIMenuStyles {
    addStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            /* Kiểu chung cho toàn bộ menu */
            .custom-script-menu {
                display: flex !important;
                flex-direction: column !important;
                position: absolute;
                background-color: #242323ff;
                min-width: 300px !important;
                z-index: 1001;
                border-radius: 5px;
                top: calc(100% + 6px);
                right: 0;
                padding: 8px;
                gap: 6px;
            }

            /* Kiểu chung cho các nhóm nút */
            .custom-script-menu-group {
                display: flex;
                flex-direction: row;
                gap: 6px;
                flex-wrap: wrap;
                justify-content: flex-start;
            }

            /* Kiểu chung cho tất cả các nút (a, button) */
            .custom-script-menu-button,
            .custom-script-menu-link {
                color: black;
                padding: 8px 10px !important;
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
            .custom-script-menu.hidden {
                visibility: hidden;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.2s ease;
            }

            .custom-script-menu-button:hover,
            .custom-script-menu-link:hover {
                box-shadow: 0 0 15px rgba(52, 152, 219, 0.7);
                transform: scale(1.03);
            }

            /* Nút auto-btn */
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

            /* Nhóm Dice Roll */
            .custom-script-dice-roll-group {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-grow: 1;
            }
            .custom-script-dice-roll-select {
                padding: 8px 10px;
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
                padding: 8px 10px;
            }
            .custom-script-dice-roll-btn:hover {
                background-color: #c0392b;
            }
            .custom-script-dice-roll-btn:disabled {
                background-color: #7f8c8d;
                cursor: not-allowed;
                box-shadow: none;
            }
            .custom-script-menu-group-dice-roll {
                display: flex;
                flex-direction: row;
                gap: 6px;
                flex-wrap: wrap;
                justify-content: flex-start;
                align-items: center;
            }

            /* Nhóm Hoang Vực */
            .custom-script-hoang-vuc-group {
                display: flex;
                flex-direction: row;
                gap: 6px;
            }
            .custom-script-hoang-vuc-btn,
            .custom-script-hoang-vuc-settings-btn {
                border-radius: 5px;
                border: none;
                font-weight: bold;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .custom-script-hoang-vuc-btn {
                background-color: #3498db;
                color: white;
            }
            .custom-script-hoang-vuc-btn:hover {
                background-color: #3498db;
            }
            .custom-script-hoang-vuc-btn:disabled {
                background-color: #7f8c8d;
                cursor: not-allowed;
                box-shadow: none;
            }
            .custom-script-hoang-vuc-settings-btn {
                width: 30px;
                height: 30px;
                background-color: #555;
                color: white;
                border-radius: 15px;
                margin-top: 5px;

            }
            .custom-script-hoang-vuc-settings-btn:hover {
                background-color: #1f6da1ff;
            }

            /* Khoáng Mạch */
            .custom-script-khoang-mach-container {
                display: flex;
                flex-direction: column;
                gap: 6px;
                width: 100%;
            }

            .custom-script-khoang-mach-button-row {
                display: flex;
                flex-direction: row;
                gap: 6px;
                width: 100%;
            }

            .custom-script-khoang-mach-button {
                padding: 8px 10px !important;
                font-size: 13px !important;
                text-decoration: none;
                border-radius: 5px;
                background-color: #3498db;
                color: white;
                font-weight: bold;
                flex-grow: 1;
                display: flex;
                justify-content: center;
                align-items: center;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease-in-out;
            }
            .custom-script-khoang-mach-button:disabled {
                background-color: #7f8c8d;
                cursor: not-allowed;
                box-shadow: none;
            }
            .custom-script-settings-panel {
                background-color: #333;
                border: 1px solid #444;
                border-radius: 5px;
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .custom-script-khoang-mach-config-group {
                display: flex;
                flex-direction: column;
                gap: 5px;
            }

            .custom-script-khoang-mach-config-group label {
                font-size: 13px;
                color: #ccc;
                font-weight: bold;
            }

            .custom-script-khoang-mach-config-group select {
                padding: 8px;
            }

            .custom-script-khoang-mach-config-group.checkbox-group {
                flex-direction: row;
                align-items: center;
                gap: 6px;
            }

            .custom-script-khoang-mach-config-group.checkbox-group input[type="checkbox"] {
                width: 16px;
                height: 16px;
            }
            .custom-script-status-icon {
                width: 10px;
                height: 10px;
                margin-top: 0px;
                margin-right: 0px;
            }

            .custom-script-item-wrapper {
                position: relative; /* Quan trọng: Đặt vị trí tương đối để định vị icon */
            }

            /* Biểu tượng trạng thái Autorun */
            .custom-script-status-icon {
                position: absolute;
                top: -5px;
                right: -5px;
                width: 10px;
                height: 10px;
                background-color: transparent;
                border-radius: 50%;
                border: none;
                z-index: 10;
            }

            /* Khi autorun đang chạy */
            .custom-script-status-icon.running {
                background-color: #e74c3c; /* Màu đỏ */
                animation: pulse 1.5s infinite; /* Hiệu ứng nhấp nháy */
            }

            /* Hiệu ứng nhấp nháy */
            @keyframes pulse {
                0% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.5);
                    opacity: 0.5;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }

            /* CSS cho container chứa nhiều thông báo */
            .custom-script-status-bar {
                position: relative;
                bottom: 0px;           /* ✅ bám đáy parent thay vì top */
                left: 50%;
                transform: translateX(-50%);
                width: 100%;
                max-width: 250px;
                padding: 5px;
                display: flex;
                flex-direction: column; /* thông báo mới nằm trên */
                gap: 5px;
                z-index: 1000;
            }

            /* CSS cho từng thông báo riêng lẻ */
            .custom-script-message {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
                color: #fff;
                white-space: nowrap;
                text-align: center;
                box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                opacity: 0;
                animation: fadeIn 0.3s forwards;
                transition: opacity 0.3s ease-in-out;
            }

            /* Các loại thông báo */
            .custom-script-message.info {
                background-color: #3498db;
            }

            .custom-script-message.success {
                background-color: #2ecc71;
            }

            .custom-script-message.error {
                background-color: #e74c3c;
            }

            /* Hiệu ứng khi thông báo bị xóa */
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: scale(0.9);
                }
            }

            @keyframes fadeIn {
                from {
                    opacity: 0;
                    transform: scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: scale(1);
                }
}
            `;

        document.head.appendChild(style);
    }
    }

    // ===============================================
    // Class quản lý việc tạo các menu con
    // ===============================================
    class UIMenuCreator {
        constructor(parentGroup, accountId) {
            this.parentGroup = parentGroup;
            this.accountId = accountId;
            this.buttonMap = new Map();
            this.autorunIsRunning = false;
        }
        setAutorunIsRunning() {
            this.autorunIsRunning = true;
        }

        // Phương thức chung để cập nhật trạng thái của nút
        async updateButtonState(taskName) {
            const button = this.buttonMap.get(taskName);
            if (!button) return;
            const statusIcon = document.querySelector('.custom-script-status-icon');

            // Xử lý logic cập nhật trạng thái dựa trên tên nhiệm vụ (taskName)
            switch (taskName) {
                case 'autorun':
                    if (this.autorunIsRunning) {
                        button.textContent = 'Đang chạy autorun...';
                        if (statusIcon) {
                            statusIcon.classList.add('running');
                        }
                    } else {
                        button.textContent = 'Autorun';
                        if (statusIcon) {
                            statusIcon.classList.remove('running');
                        }
                    }
                    break;
                case 'diemdanh':
                case 'thiluyen':
                case 'phucloi':
                case 'hoangvuc':
                case 'luanvo':
                case 'khoangmach':
                    if (taskTracker.isTaskDone(this.accountId, taskName)) {
                        button.disabled = true;
                        button.textContent = `${button.textContent.replace(' ✅', '')} ✅`;
                    } else {
                        button.disabled = false;
                        button.textContent = button.textContent.replace(' ✅', '');
                    }
                    break;
                case 'dothach':
                    const currentHour = parseInt(new Date().toLocaleString('en-US', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: 'numeric',
                        hour12: false // Định dạng 24 giờ
                    }), 10);

                    const isBetTime = (currentHour >= 6 && currentHour < 13) || (currentHour >= 16 && currentHour < 21);
                    const status = taskTracker.getTaskStatus(this.accountId, 'dothach');
                    if ((status.betplaced && isBetTime) || (status.reward_claimed && !isBetTime)) {
                        button.disabled = true;
                    } else {
                        button.disabled = false;
                    }
                    break;
                case 'bicanh':
                    const isDailyLimit = await bicanh.isDailyLimit();
                    if (isDailyLimit) {
                        button.disabled = true;
                        button.textContent = 'Bí Cảnh ✅';
                    } else {
                        button.disabled = false;
                        button.textContent = 'Bí Cảnh';
                    }
                    break;
            }
        }

        // Phương thức tạo menu "Đổ Thạch"
        async createDiceRollMenu(parentGroup) {
            parentGroup.classList.add('custom-script-dice-roll-group');

            const select = document.createElement('select');
            select.id = 'dice-roll-select';
            select.classList.add('custom-script-dice-roll-select');

            const optionTai = document.createElement('option');
            optionTai.value = 'tai';
            optionTai.textContent = 'Tài';
            select.appendChild(optionTai);

            const optionXiu = document.createElement('option');
            optionXiu.value = 'xiu';
            optionXiu.textContent = 'Xỉu';
            select.appendChild(optionXiu);

            const savedChoice = localStorage.getItem('dice-roll-choice') ?? 'tai';
            select.value = savedChoice;

            // 🔹 Lưu lại mỗi khi thay đổi
            select.addEventListener('change', () => {
                localStorage.setItem('dice-roll-choice', select.value);
            });

            const rollButton = document.createElement('button');
            rollButton.textContent = 'Đổ Thạch';
            rollButton.classList.add('custom-script-menu-button', 'custom-script-dice-roll-btn');
            this.buttonMap.set('dothach', rollButton);

            rollButton.addEventListener('click', async () => {
                const selectedChoice = select.value;
                rollButton.textContent = 'Đang xử lý...';
                await dothach.run(selectedChoice);
                rollButton.textContent = 'Đổ Thạch';
                this.updateButtonState('dothach');
            });

            this.updateButtonState('dothach');
            parentGroup.appendChild(select);
            parentGroup.appendChild(rollButton);

        }

        // Phương thức tạo menu "Hoang Vực"
        createHoangVucMenu(parentGroup) {
            const hoangVucButton = document.createElement('button');
            hoangVucButton.textContent = 'Hoang Vực';
            hoangVucButton.classList.add('custom-script-hoang-vuc-btn');
            this.buttonMap.set('hoangvuc', hoangVucButton)

            const settingsButton = document.createElement('button');
            settingsButton.classList.add('custom-script-hoang-vuc-settings-btn');

            const updateSettingsIcon = () => {
                const maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
                if (maximizeDamage) {
                    settingsButton.textContent = '🔼';
                    settingsButton.title = 'Tối đa hoá sát thương: Bật';
                } else {
                    settingsButton.textContent = '🔷';
                    settingsButton.title = 'Tối đa hoá sát thương: Tắt';
                }
            };
            
            hoangVucButton.addEventListener('click', async () => {
                hoangVucButton.disabled = true;
                hoangVucButton.textContent = 'Đang xử lý...';
                const maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
                try {
                    await hoangvuc.doHoangVuc(maximizeDamage);
                }
                finally {
                    hoangVucButton.textContent = 'Hoang Vực';
                    this.updateButtonState('hoangvuc');
                }
            });

            settingsButton.addEventListener('click', () => {
                let maximizeDamage = localStorage.getItem('hoangvucMaximizeDamage') === 'true';
                const newSetting = !maximizeDamage;
                localStorage.setItem('hoangvucMaximizeDamage', newSetting);
                const message = newSetting ? 'Đổi ngũ hành để tối đa hoá sát thương' : 'Đổi ngũ hành để không bị giảm sát thương';
                showNotification(`[Hoang vực] ${message}`, 'info');
                updateSettingsIcon();
            });

            parentGroup.appendChild(settingsButton);
            parentGroup.appendChild(hoangVucButton);
            
            this.updateButtonState('hoangvuc');
            updateSettingsIcon();
        }

        // Phương thức tạo menu "Luận Võ"
        createLuanVoMenu(parentGroup) {
            const luanVoButton = document.createElement('button');
            this.buttonMap.set('luanvo', luanVoButton);
            const luanVoSettingsButton = document.createElement('button');
            luanVoSettingsButton.classList.add('custom-script-hoang-vuc-settings-btn');
            
            if (localStorage.getItem('luanVoAutoChallenge') === null) {
            localStorage.setItem('luanVoAutoChallenge', '1');
            }
            let autoChallengeEnabled = localStorage.getItem('luanVoAutoChallenge') === '1';

            const updateSettingButtonState = (isEnabled) => {
                luanVoSettingsButton.textContent = isEnabled ? '✅' : '❌';
                luanVoSettingsButton.title = isEnabled ? 'Tự động thực hiện Luận Võ: Bật' : 'Tự động thực hiện Luận Võ: Tắt';
            };
            updateSettingButtonState(autoChallengeEnabled);
            parentGroup.appendChild(luanVoSettingsButton);

            luanVoSettingsButton.addEventListener('click', () => {
                autoChallengeEnabled = !autoChallengeEnabled;
                localStorage.setItem('luanVoAutoChallenge', autoChallengeEnabled ? '1' : '0');
                updateSettingButtonState(autoChallengeEnabled);
                const message = autoChallengeEnabled ? 'Tự động thực hiện Luận Võ đã được bật' : 'Tự động thực hiện Luận Võ đã được tắt';
                showNotification(`[Luận Võ] ${message}`, 'info');
            });

            luanVoButton.textContent = 'Luận Võ';
            luanVoButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
            luanVoButton.addEventListener('click', async () => {
                luanVoButton.disabled = true;
                luanVoButton.textContent = 'Đang xử lý...';
                try {
                    const currentAutoChallenge = localStorage.getItem('luanVoAutoChallenge') === '1';
                    await luanvo.startLuanVo(currentAutoChallenge);
                } finally {
                    luanVoButton.textContent = 'Luận Võ';
                    this.updateButtonState('luanvo');
                }
            });

            parentGroup.appendChild(luanVoButton);
            this.updateButtonState('luanvo')
        }

        // Phương thức tạo menu "Autorun"
        createAutorunMenu(parentGroup) {
            const autorunButton = document.createElement('button');
            this.buttonMap.set('autorun', autorunButton);
            const autorunSettingsButton = document.createElement('button');
            autorunSettingsButton.classList.add('custom-script-hoang-vuc-settings-btn');
            
            if (localStorage.getItem('autorunEnabled') === null) {
                localStorage.setItem('autorunEnabled', '1');
            }
            let autorunEnabled = localStorage.getItem('autorunEnabled') === '1';

            const updateSettingButtonState = (isEnabled) => {
                autorunSettingsButton.textContent = isEnabled ? '✅' : '❌';
                autorunSettingsButton.title = isEnabled ? 'Tự động chạy Autorun khi tải: Bật' : 'Tự động chạy Autorun khi tải: Tắt';
            };
            updateSettingButtonState(autorunEnabled);
            

            autorunSettingsButton.addEventListener('click', () => {
                autorunEnabled = !autorunEnabled;
                localStorage.setItem('autorunEnabled', autorunEnabled ? '1' : '0');
                updateSettingButtonState(autorunEnabled);
                const message = autorunEnabled ? 'Tự động chạy Autorun khi tải đã được bật' : 'Tự động chạy Autorun khi tải đã được tắt';
                showNotification(message, 'info');
            });

            autorunButton.textContent = 'Autorun';
            autorunButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
            autorunButton.addEventListener('click', async () => {
                this.autorunIsRunning = !this.autorunIsRunning
                this.updateButtonState('autorun');
                if (this.autorunIsRunning) {
                    await automatic.start();
                } else {
                    await automatic.stop();
                    createUI.clearStatusBar();
                }
            });

            parentGroup.appendChild(autorunSettingsButton);
            parentGroup.appendChild(autorunButton);
            this.updateButtonState('autorun');
        }

        // Phương thức tạo menu "Bí Cảnh"
        async createBiCanhMenu(parentGroup) {
            const biCanhButton = document.createElement('button');
            this.buttonMap.set('bicanh', biCanhButton);
            biCanhButton.textContent = 'Bí Cảnh';
            biCanhButton.classList.add('custom-script-menu-button', 'custom-script-auto-btn');

            biCanhButton.addEventListener('click', async () => {
                biCanhButton.disabled = true;
                biCanhButton.textContent = 'Đang xử lý...';
                try {
                    await bicanh.doBiCanh();
                } finally {
                    biCanhButton.textContent = 'Bí Cảnh';
                    this.updateButtonState('bicanh');
                }
            });
            parentGroup.appendChild(biCanhButton);
            this.updateButtonState('bicanh');
        }

        // Phương thức tạo menu "Khoáng Mạch"
        async createKhoangMachMenu(parentGroup) {
            const { optionsHtml, minesData } = await khoangmach.getAllMines();
            const container = document.createElement('div');
            container.classList.add('custom-script-khoang-mach-container');

            const buttonRow = document.createElement('div');
            buttonRow.classList.add('custom-script-khoang-mach-button-row');

            const khoangMachButton = document.createElement('button');
            khoangMachButton.classList.add('custom-script-khoang-mach-button');
            khoangMachButton.textContent = 'Khoáng Mạch';
            this.buttonMap.set('khoangmach', khoangMachButton);

            const khoangMachSettingsButton = document.createElement('button');
            khoangMachSettingsButton.classList.add('custom-script-hoang-vuc-settings-btn');
            khoangMachSettingsButton.textContent = '⚙️';

            buttonRow.appendChild(khoangMachSettingsButton);
            buttonRow.appendChild(khoangMachButton);

            const configDiv = document.createElement('div');
            configDiv.style.display = 'none';
            configDiv.classList.add('custom-script-settings-panel');
            configDiv.innerHTML = `
            <div class="custom-script-khoang-mach-config-group">
                <label for="specificMineSelect">Chọn Khoáng Mạch:</label>
                <select id="specificMineSelect">${optionsHtml}</select>
            </div>
            <div class="custom-script-khoang-mach-config-group">
                <label for="rewardModeSelect">Chế độ Nhận Thưởng:</label>
                <select id="rewardModeSelect">
                <option value="110">110%</option>
                <option value=">50">> 50%</option>
                <option value=">0">> 0%</option>
                <option value="any">Bất kỳ</option>
                </select>
            </div>
            <div class="custom-script-khoang-mach-config-group checkbox-group">
                <input type="checkbox" id="autoTakeOver">
                <label for="autoTakeOver">Tự động đoạt mỏ khi chưa buff</label>
            </div>
            <div class="custom-script-khoang-mach-config-group checkbox-group">
                <input type="checkbox" id="autoTakeOverRotation">
                <label for="autoTakeOverRotation">Tự động đoạt mỏ khi có thể (đảo key)</label>
            </div>
            <div class="custom-script-khoang-mach-config-group checkbox-group">
                <input type="checkbox" id="autoBuff">
                <label for="autoBuff">Tự động mua Linh Quang Phù</label>
            </div>
            `;

            container.appendChild(buttonRow);
            container.appendChild(configDiv);
            parentGroup.appendChild(container);

            const specificMineSelect = configDiv.querySelector('#specificMineSelect');
            const rewardModeSelect = configDiv.querySelector('#rewardModeSelect');
            const autoTakeOverCheckbox = configDiv.querySelector('#autoTakeOver');
            const autoTakeOverRotationCheckbox = configDiv.querySelector('#autoTakeOverRotation');
            const autoBuffCheckbox = configDiv.querySelector('#autoBuff');

            const savedMineSetting = localStorage.getItem('khoangmach_selected_mine');
            if (savedMineSetting) {
            try {
                const mineInfo = JSON.parse(savedMineSetting);
                if (mineInfo && mineInfo.id) specificMineSelect.value = mineInfo.id;
            } catch (e) {
                localStorage.removeItem('khoangmach_selected_mine');
            }
            }
            rewardModeSelect.value = localStorage.getItem('khoangmach_reward_mode') || 'any';
            autoTakeOverCheckbox.checked = localStorage.getItem('khoangmach_auto_takeover') === 'true';
            autoTakeOverRotationCheckbox.checked = localStorage.getItem('khoangmach_auto_takeover_rotation') === 'true';
            autoBuffCheckbox.checked = localStorage.getItem('khoangmach_use_buff') === 'true';

            let settingsOpen = false;
            khoangMachSettingsButton.addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            configDiv.style.display = settingsOpen ? 'block' : 'none';
            khoangMachSettingsButton.title = settingsOpen ? 'Đóng cài đặt Khoáng Mạch' : 'Mở cài đặt Khoáng Mạch';
            });

            specificMineSelect.addEventListener('change', (e) => {
                const selectedId = e.target.value;
                const selectedMine = minesData.find(mine => mine.id === selectedId);
                if (selectedMine && selectedMine.type) {
                    localStorage.setItem('khoangmach_selected_mine', JSON.stringify({ id: selectedId, type: selectedMine.type }));
                    showNotification(`[Khoáng Mạch] Đã chọn mỏ: ${e.target.options[e.target.selectedIndex].text}`, 'info');
                }
            });

            rewardModeSelect.addEventListener('change', (e) => {
            localStorage.setItem('khoangmach_reward_mode', e.target.value);
            showNotification(`[Khoáng Mạch] Chế độ nhận thưởng: ${e.target.options[e.target.selectedIndex].text}`, 'info');
            });

            autoTakeOverCheckbox.addEventListener('change', (e) => {
                localStorage.setItem('khoangmach_auto_takeover', e.target.checked);
                const status = e.target.checked ? 'Bật' : 'Tắt';
                showNotification(`[Khoáng Mạch] Tự động đoạt mỏ khi chưa buff: ${status}`, 'info');
            });

            autoTakeOverRotationCheckbox.addEventListener('change', (e) => {
                localStorage.setItem('khoangmach_auto_takeover_rotation', e.target.checked);
                const status = e.target.checked ? 'Bật' : 'Tắt';
                showNotification(`[Khoáng Mạch] Tự động đoạt mỏ khi có thể: ${status}`, 'info');
            });

            autoBuffCheckbox.addEventListener('change', (e) => {
                localStorage.setItem('khoangmach_use_buff', e.target.checked);
                const status = e.target.checked ? 'Bật' : 'Tắt';
                showNotification(`[Khoáng Mạch] Tự động mua Linh Quang Phù: ${status}`, 'info');
            });

            khoangMachButton.addEventListener('click', async () => {
                khoangMachButton.disabled = true;
                khoangMachButton.textContent = 'Đang xử lý...';
                try {
                    await khoangmach.doKhoangMach();
                }
                finally {
                    khoangMachButton.textContent = 'Khoáng Mạch'; 
                    this.updateButtonState('khoangmach');
                }
            });
            
            this.updateButtonState('khoangmach');
        }

        // Phương thức chung để tạo các nút nhiệm vụ tự động
        createAutoTaskButton(link, parentGroup) {
            const button = document.createElement('button');
            
            const taskName = link.isDiemDanh ? 'diemdanh' : 
                             link.isThiLuyen ? 'thiluyen' : 
                             link.isPhucLoi ? 'phucloi' : null;
            
            if (!taskName) return;

            // Lưu nút vào Map
            this.buttonMap.set(taskName, button);

            button.textContent = link.text;
            button.classList.add('custom-script-menu-button', 'custom-script-auto-btn');
            const originalColor = button.style.backgroundColor || '';
            const runningColor = '#ff0000ff';

            button.addEventListener('click', async () => {
                if (taskName === 'autorun') {
                    this.autorunIsRunning = !this.autorunIsRunning;

                    if (this.autorunIsRunning) {
                        await automatic.start();
                        button.style.backgroundColor = runningColor;
                    } else {
                        automatic.stop();
                        button.style.backgroundColor = originalColor;
                    }
                    this.updateButtonState('autorun');
                } else {
                    button.disabled = true;
                    button.textContent = 'Đang xử lý...';
                    try {
                        if (taskName === 'diemdanh') {
                            const nonce = await getNonce();
                            if (!nonce) {
                                showNotification('Không tìm thấy nonce! Vui lòng tải lại trang.', 'error');
                                return;
                            }
                            await doDailyCheckin(nonce);
                            await doClanDailyCheckin(nonce);
                            await vandap.doVanDap(nonce);
                            console.log('[HH3D Script] ✅ Điểm danh, tế lễ, vấn đáp đã hoàn thành.');
                        } else if (taskName === 'thiluyen') {
                            await doThiLuyenTongMon();
                            console.log('[HH3D Script] ✅ Thí Luyện Tông Môn đã hoàn thành.');
                        } else if (taskName === 'phucloi') {
                            await doPhucLoiDuong();
                            console.log('[HH3D Script] ✅ Phúc Lợi đã hoàn thành.');                        }
                    } finally {
                        button.textContent = link.text;
                        this.updateButtonState(taskName);
                    }
                 }
            });

        // Cập nhật trạng thái ban đầu của nút
        this.updateButtonState(taskName);
        parentGroup.appendChild(button);
        }
    }

    // ===============================================
    // Class khởi tạo và chèn menu vào DOM
    // ===============================================
    class UIInitializer {
        constructor(selector, linkGroups, accountId) {
            this.selector = selector;
            this.linkGroups = linkGroups;
            this.accountId = accountId;

            this.retryInterval = 500;
            this.timeout = 15000;
            this.elapsedTime = 0;
            this.intervalId = null;
            this.uiMenuCreator = new UIMenuCreator(null, this.accountId);
        }

        start() {
            console.log('[HH3D Script] ⏳ Đang tìm kiếm vị trí để chèn menu...');
            this.intervalId = setInterval(() => this.checkAndInsert(), this.retryInterval);
        }

        checkAndInsert() {
            const notificationsDiv = document.querySelector(this.selector);
            if (notificationsDiv) {
            clearInterval(this.intervalId);
            console.log('[HH3D Script] ✅ Đã tìm thấy vị trí. Bắt đầu chèn menu.');
            this.createAndInjectMenu(notificationsDiv);
            } else {
            this.elapsedTime += this.retryInterval;
            if (this.elapsedTime >= this.timeout) {
                clearInterval(this.intervalId);
                console.error(`[HH3D Script - Lỗi] ❌ Không tìm thấy phần tử "${this.selector}" sau ${this.timeout / 1000} giây.`);
            }
            }
        }

        createAndInjectMenu(notificationsDiv) {
            const parentNavItems = notificationsDiv.parentNode;
            if (parentNavItems && parentNavItems.classList.contains('nav-items')) {
            if (document.querySelector('.custom-script-item-wrapper')) {
                console.log('[HH3D Script] ⚠️ Menu đã tồn tại. Bỏ qua việc chèn lại.');
                return;
            }

            const customMenuWrapper = document.createElement('div');
            customMenuWrapper.classList.add('load-notification', 'relative', 'custom-script-item-wrapper');

            const newMenuButton = document.createElement('a');
            newMenuButton.href = '#';
            newMenuButton.setAttribute('data-view', 'hide');

            // Tạo phần tử div cho biểu tượng trạng thái
            const statusIcon = document.createElement('div');
            statusIcon.classList.add('custom-script-status-icon');
            //statusIcon.classList.add('material-icons-round1', 'material-icons-menu');
            newMenuButton.appendChild(statusIcon);



            const iconDiv = document.createElement('div');
            const iconSpan = document.createElement('span');
            iconSpan.classList.add('material-icons-round1', 'material-icons-menu');
            iconSpan.textContent = 'task';
            iconDiv.appendChild(iconSpan);
            newMenuButton.appendChild(iconDiv);

            const dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'custom-script-menu hidden';

            this.linkGroups.forEach(group => {
                const groupDiv = document.createElement('div');
                groupDiv.className = 'custom-script-menu-group';
                dropdownMenu.appendChild(groupDiv);

                group.links.forEach(link => {
                if (link.isDiemDanh || link.isThiLuyen || link.isPhucLoi) {
                    this.uiMenuCreator.createAutoTaskButton(link, groupDiv);
                } else if (link.isDiceRoll) {
                    // Đổ Thạch
                    this.uiMenuCreator.createDiceRollMenu(groupDiv);
                } else if (link.isAutorun) {
                    // AUTORUN
                    this.uiMenuCreator.createAutorunMenu(groupDiv);
                } else if (link.isHoangVuc) {
                    // Hoang Vuc
                    this.uiMenuCreator.createHoangVucMenu(groupDiv);
                } else if (link.isLuanVo) {
                    // Luan Vo
                    this.uiMenuCreator.createLuanVoMenu(groupDiv);
                } else if (link.isBiCanh) {
                    // Bí Cảnh
                    this.uiMenuCreator.createBiCanhMenu(groupDiv);
                } else if (link.isKhoangMach) {
                    // Khoáng Mạch
                    this.uiMenuCreator.createKhoangMachMenu(groupDiv);
                } else {
                    const menuItem = document.createElement('a');
                    menuItem.classList.add('custom-script-menu-link');
                    menuItem.href = link.url;
                    menuItem.textContent = link.text;
                    menuItem.target = '_blank';
                    groupDiv.appendChild(menuItem);
                }
                });
            });

            // --- THÊM DÒNG NÀY ĐỂ TẠO THANH TRẠNG THÁI ---
            const statusBar = document.createElement('div');
            statusBar.className = 'custom-script-status-bar';
            dropdownMenu.appendChild(statusBar);
            // ---------------------------------------------
            customMenuWrapper.appendChild(newMenuButton);
            customMenuWrapper.appendChild(dropdownMenu);
            parentNavItems.insertBefore(customMenuWrapper, notificationsDiv.nextSibling);







            console.log('[HH3D Script] 🎉 Chèn menu tùy chỉnh thành công!');

            newMenuButton.addEventListener('click', (e) => {
                e.preventDefault();
                dropdownMenu.classList.toggle('hidden');
                iconSpan.textContent = dropdownMenu.classList.contains('hidden') ? 'task' : 'highlight_off';
            });

            document.addEventListener('click', (e) => {
                if (!customMenuWrapper.contains(e.target)) {
                dropdownMenu.classList.add('hidden');
                iconSpan.textContent = 'task';
                }
            });
            } else {
            console.warn('[HH3D Script - Cảnh báo] ⚠️ Không tìm thấy phần tử cha ".nav-items". Không thể chèn menu.');
            }
        };


        // Hàm để cập nhật statusbar
        updateStatusBar(message, type = 'info', duration = null) {
            const statusBar = document.querySelector('.custom-script-status-bar');
            if (!statusBar) return;

            const messageElement = document.createElement('div');
            messageElement.className = 'custom-script-message';
            messageElement.classList.add(type);
            messageElement.textContent = message;

            // Thêm thông báo vào cuối danh sách
            statusBar.appendChild(messageElement);

            // Xóa thông báo cũ nếu quá nhiều để tránh tràn màn hình
            while (statusBar.children.length > 5) { // Giới hạn 5 thông báo
                statusBar.removeChild(statusBar.firstChild);
            }

            // Tự động xóa thông báo sau một khoảng thời gian
            if (duration !== null) {
                setTimeout(() => {
                    messageElement.style.animation = 'fadeOut 0.3s forwards';
                    messageElement.addEventListener('animationend', () => {
                        if (messageElement.parentNode === statusBar) {
                            statusBar.removeChild(messageElement);
                        }
                    });
                }, duration);
            }
        }

        // Hàm mới để xóa tất cả thông báo
        clearStatusBar() {
            const statusBar = document.querySelector('.custom-script-status-bar');
            if (statusBar) {
                while (statusBar.firstChild) {
                    statusBar.removeChild(statusBar.firstChild);
                }
            }
        }

        // Hàm gọi phương thức updateButtonState của UIMenuCreator
        async updateButtonState(taskName) {
            await this.uiMenuCreator.updateButtonState(taskName);
        }
    }


    // ===============================================
    // Automactic
    // ===============================================
    class AutomationManager {
        constructor() {
            this.accountId = accountId;
            this.delay = 5000;
            this.CHECK_INTERVAL_TIEN_DUYEN = 30*60*1000;
            this.INTERVAL_HOANG_VUC = 15*60*1000 + this.delay;
            this.INTERVAL_PHUC_LOI = 30*60*1000 + this.delay;
            this.INTERVAL_THI_LUYEN = 30*60*1000 + this.delay;
            this.INTERVAL_BI_CANH = 7*60*1000 + this.delay;
            this.INTERVAL_KHOANG_MACH = 30*60*1000 + this.delay;
            this.timeoutIds = {};
        }

        async start() {
            console.log(`[Auto] Bắt đầu quá trình tự động cho tài khoản: ${this.accountId}`);
            // Thực hiện các tác vụ ban đầu
            await this.doInitialTasks();
            // Bắt đầu chu kỳ hẹn giờ cho Tiên Duyên
            this.scheduleTienDuyenCheck();
            // Đổ thạch
            this.scheduleDoThach();
            // Các tác vụ khác
            this.scheduleTask('hoangvuc', () => hoangvuc.doHoangVuc(), this.INTERVAL_HOANG_VUC);
            this.scheduleTask('thiluyen', () => doThiLuyenTongMon(), this.INTERVAL_THI_LUYEN);
            this.scheduleTask('phucloi', () => doPhucLoiDuong(), this.INTERVAL_PHUC_LOI);
            this.scheduleTask('khoangmach', () => khoangmach.doKhoangMach(), this.INTERVAL_KHOANG_MACH);
            this.scheduleTask('bicanh', () => bicanh.doBiCanh(), this.INTERVAL_BI_CANH);
        }

        async doInitialTasks() {
            if (!taskTracker.isTaskDone(this.accountId, 'diemdanh')) {
                try {
                    const nonce = await getNonce()
                    if (!nonce) return
                    await doDailyCheckin(nonce);
                    await doClanDailyCheckin(nonce);
                    await vandap.doVanDap(nonce);
                    createUI.updateButtonState('diemdanh')
                } catch (e) {
                    console.error("[Auto] Lỗi khi thực hiện Điểm danh, tế lễ, vấn đáp:", e);
                }
            } else {
                createUI.updateButtonState('diemdanh')
            }
        }

        async scheduleTienDuyenCheck() {
            const now = Date.now();
            const lastCheckTienDuyen = taskTracker.getLastCheckTienDuyen(this.accountId);
            let timeToNextCheck;

            if (lastCheckTienDuyen === null || now - lastCheckTienDuyen >= this.CHECK_INTERVAL_TIEN_DUYEN) {
                console.log("[Auto] Đã đến giờ làm Tiên Duyên. Đang thực hiện...");
                try {
                    await tienduyen.doTienDuyen();
                } catch (error) {
                    console.error("[Auto] Lỗi khi thực hiện Tiên Duyên:", error);
                }
                timeToNextCheck = this.CHECK_INTERVAL_TIEN_DUYEN;
            } else {
                timeToNextCheck = this.CHECK_INTERVAL_TIEN_DUYEN - (now - lastCheckTienDuyen);
                console.log(`[Auto] Chưa đến giờ tiên duyên. Sẽ chờ ${timeToNextCheck}ms.`);
            }

            // Hẹn giờ gọi lại chính nó sau khoảng thời gian đã tính
            if (this.tienduyenTimeout) clearTimeout(this.tienduyenTimeout);
            this.tienduyenTimeout = setTimeout(() => this.scheduleTienDuyenCheck(), timeToNextCheck);
        }
        
        
        /**
         * Tạo lịch trình cho một nhiệm vụ cụ thể.
         - Ví dụ: scheduleTask('thiluyen', () => thiluyen.doThiLuyen(), this.INTERVAL_THI_LUYEN, 'thiluyenTimeout')
         * @param {string} taskName Tên của nhiệm vụ, dùng để truy vấn trạng thái (ví dụ: 'thiluyen').
         * @param {Function} taskAction Hàm bất đồng bộ thực thi nhiệm vụ (ví dụ: `hoangvuc.doHoangVuc`).
         * @param {number} interval Chu kỳ lặp lại của nhiệm vụ tính bằng mili giây.
         */
        async scheduleTask(taskName, taskAction, interval) {
            if (this.timeoutIds[taskName]) clearTimeout(this.timeoutIds[taskName]);
            let isTaskDone;
            if (taskName === 'bicanh' && await bicanh.isDailyLimit()) {
                isTaskDone = true;
            } else {
                isTaskDone = taskTracker.isTaskDone(this.accountId, taskName);
            }
            // Kiểm tra và dừng lịch trình nếu nhiệm vụ đã hoàn thành
            if (isTaskDone) {
                createUI.updateButtonState(taskName);
                return;
            }

            const now = Date.now();
            const nextTime = taskTracker.getNextTime(this.accountId, taskName);
            let timeToNextCheck;

            if (nextTime === null || now >= nextTime) {
                console.log(`[Auto] Đã đến giờ làm nhiệm vụ: ${taskName}. Đang thực hiện...`);
                try {
                    await taskAction(); // Thực thi hàm nhiệm vụ
                    timeToNextCheck = interval;
                    createUI.updateButtonState(taskName);
                } catch (error) {
                    console.error(`[Auto] Lỗi khi thực hiện nhiệm vụ ${taskName}:`, error);
                    // Có thể đặt thời gian chờ ngắn hơn khi có lỗi để thử lại
                    timeToNextCheck = 3*60 * 1000; // Thử lại sau 3 phút
                }
            } else {
                createUI.updateButtonState(taskName);
                timeToNextCheck = Math.max(nextTime - now, 0);
                console.log(`[Auto] Nhiệm vụ ${taskName} chưa đến giờ, sẽ chờ ${timeToNextCheck}ms.`);
            }

            // Hẹn giờ cho lần chạy tiếp theo
            if (this.timeoutIds[taskName]) clearTimeout(this.timeoutIds[taskName]);
            if (!taskTracker.isTaskDone(accountId,taskName)) {
                const taskFullName = {
                    hoangvuc: "Hoang Vực",
                    phucloi: "Phúc Lợi",
                    thiluyen: "Thí Luyện",
                    bicanh: "Bí Cảnh",
                    khoangmach: "Khoáng Mạch"
                }[taskName];
                //showNotification(
                createUI.updateStatusBar(
                    `🕐 ${taskFullName}: ${new Date(Date.now() + timeToNextCheck).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
                    'info',
                    timeToNextCheck
                );
                this.timeoutIds[taskName] = setTimeout(() => this.scheduleTask(taskName, taskAction, interval), timeToNextCheck);
            }
        }

        async scheduleDoThach() {
            const status = taskTracker.getTaskStatus(accountId, 'dothach');
                const isBetPlaced = status.betplaced;
                const isRewardClaimed = status.reward_claimed;
                
                const currentHour = parseInt(
                    new Date().toLocaleString('en-US', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        hour: 'numeric',
                        hour12: false
                    }),
                    10
                );

                let nextActionTime; // Giờ hành động tiếp theo (ví dụ: 13, 16, 21, 6)
                let timeToNextCheck; // Thời gian chờ (mili giây)

                const calculateTimeToNextHour = (targetHour) => {
                    const now = new Date();
                    const nextTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), targetHour, 0, 0, 0);
                    if (now.getHours() >= targetHour) {
                        nextTime.setDate(nextTime.getDate() + 1); // Nếu giờ mục tiêu đã qua, chuyển sang ngày mai
                    }
                    return nextTime.getTime() - now.getTime();
                };

                if (isBetPlaced) {
                    // Đã đặt cược, chờ đến giờ nhận thưởng
                    if (currentHour >= 6 && currentHour < 13) {
                        nextActionTime = 13; // Chờ đến 13h để nhận thưởng lần 1
                    } else if (currentHour >= 16 && currentHour < 21) {
                        nextActionTime = 21; // Chờ đến 21h để nhận thưởng lần 2
                    } else {
                        console.log('[Đổ Thạch] Đã đặt cược nhưng không trong khung giờ cược, chờ khung giờ nhận thưởng tiếp theo.');
                        if (currentHour < 13) {
                            nextActionTime = 13;
                        } else if (currentHour < 21) {
                            nextActionTime = 21;
                        } else {
                            nextActionTime = 6; // Chờ đến 6h sáng mai
                        }
                    }
                } else if (isRewardClaimed) {
                    // Đã nhận thưởng, chờ đến giờ đặt cược tiếp theo
                    if (currentHour >= 13 && currentHour < 16) {
                        nextActionTime = 16; // Chờ đến 16h để đặt cược lần 2
                    } else {
                        nextActionTime = 6; // Chờ đến 6h sáng hôm sau
                    }
                } else {
                    const stoneType = localStorage.getItem('dice-roll-choice') ?? 'tai';
                    // Chưa đặt cược hoặc chưa nhận thưởng. Cần kiểm tra khung giờ hiện tại
                    if (currentHour >= 6 && currentHour < 13) {
                        console.log('[Đổ Thạch] Đang trong khung giờ 6h-13h. Đang đặt cược...');
                        await dothach.run(stoneType); // Thực hiện đặt cược
                        nextActionTime = 13; // Sau khi cược, chờ đến 13h để kiểm tra thưởng
                    } else if (currentHour >= 16 && currentHour < 21) {
                        console.log('[Đổ Thạch] Đang trong khung giờ 16h-21h. Đang đặt cược...');
                        await dothach.run(stoneType); // Thực hiện đặt cược
                        nextActionTime = 21; // Sau khi cược, chờ đến 21h để kiểm tra thưởng
                    } else {
                        // Không trong khung giờ nào, chờ đến khung giờ đặt cược tiếp theo
                        console.log('[Đổ Thạch] Không trong khung giờ cược. Chờ...');
                        if (currentHour < 6) {
                            nextActionTime = 6;
                        } else if (currentHour < 16) {
                            nextActionTime = 16;
                        } else {
                            nextActionTime = 6; // Chờ đến 6h sáng mai
                        }
                    }
                }
                
                timeToNextCheck = calculateTimeToNextHour(nextActionTime);
                
                // Hủy timeout cũ nếu có và thiết lập timeout mới
                if (this.dothachTimeout) clearTimeout(this.dothachTimeout);
                this.dothachTimeout = setTimeout(() => this.scheduleDoThach(), timeToNextCheck);
                
                console.log(`[Đổ Thạch] Lần kiểm tra tiếp theo lúc: ${new Date(Date.now() + timeToNextCheck).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`);
            }

        stop() {
            for (const taskName in this.timeoutIds) {
                if (this.timeoutIds[taskName]) {
                    clearTimeout(this.timeoutIds[taskName]);
                    this.timeoutIds[taskName] = null; // Đặt lại giá trị để tránh rò rỉ bộ nhớ
                    console.log(`[Auto] Đã hủy hẹn giờ cho nhiệm vụ: ${taskName}`);
                }
            }
            if (this.tienduyenTimeout) {
                clearTimeout(this.tienduyenTimeout);
            console.log(`Đã dừng quá trình tự động cho tài khoản: ${this.accountId}`);
            }
        }

        checkAndStart() {
            if (localStorage.getItem('autorunEnabled') === null) {
                localStorage.setItem('autorunEnabled', '0');
            }

            let autorunEnabled = localStorage.getItem('autorunEnabled') === '1';

            if (autorunEnabled) {
                console.log('[Automation] Tự động khởi động Autorun...');
                
                // Tạo một hàm chờ để đảm bảo UI đã sẵn sàng
                const checkStatusIcon = () => {
                    const statusIcon = document.querySelector('.custom-script-status-icon');
                    if (statusIcon) {
                        // Nếu icon đã tồn tại, cập nhật trạng thái và bắt đầu tác vụ
                        createUI.uiMenuCreator.setAutorunIsRunning();
                        createUI.uiMenuCreator.updateButtonState('autorun');
                        this.start();
                    } else {
                        // Nếu icon chưa tồn tại, chờ 100ms và thử lại
                        setTimeout(checkStatusIcon, 100);
                    }
                };

                // Bắt đầu quá trình kiểm tra
                checkStatusIcon();
            }
        }
    }

    // ===============================================
    // KHỞI TẠO SCRIPT
    // ===============================================
    const taskTracker = new TaskTracker();
    const accountId = await getAccountId();
        if (accountId) {
            let accountData = taskTracker.getAccountData(accountId);
            console.log(`[HH3D] ✅ Account ID: ${accountId}`);
            console.log(`[HH3D] ✅ Đã lấy dữ liệu tài khoản: ${JSON.stringify(accountData)}`);
        } else {
            console.warn('[HH3D] ⚠️ Không thể lấy ID tài khoản.');
        }
    const vandap = new VanDap();
    const dothach = new DoThach();
    const hoangvuc = new HoangVuc();
    const luanvo = new LuanVo();
    const bicanh = new BiCanh();
    const khoangmach = new KhoangMach();
    // Khởi tạo và chạy các class
    const uiStyles = new UIMenuStyles();
    uiStyles.addStyles();

    const createUI = new UIInitializer('.load-notification.relative', LINK_GROUPS, accountId);
    createUI.start();
    const tienduyen = new TienDuyen();
    await tienduyen.init();
    const automatic = new AutomationManager();
    automatic.checkAndStart()
    
})();
