// ==UserScript==
// @name         通用(GitHub在线版)
// @namespace    https://github.com/YOUR_USERNAME
// @version      3.9.6
// @description  GitHub在线激活，移除检查按钮，按钮间距协调，支持白名单/调速/任意题数
// @author       © 2026 飞哥 ✯
// @icon         https://i.imgs.ovh/2026/04/03/ZDBC3H.jpeg
// @match        http://61.185.41.209:8888/*
// @match        http://61.185.41.209:8888/Content/ExamOnlineTest/*
// @match        http://61.185.41.209:8888/*/
// @match        http://61.150.84.25:100/*
// @match        http://*/Content/ExamOnlineTest/*
// @match        http://*/*/ExamManger/OnlineTest/*
// @match        http://qyks.hlkyjt.com.cn/*
// @match        http://qyks.hlkyjt.com.cn/Content/ExamOnlineTest/*
// @match        http://qyks.hlkyjt.com.cn/*/ExamManger/OnlineTest/*
// @match        http://219.144.20.38:9091/*
// @match        http://219.144.20.38:9091/Content/ExamOnlineTest/*
// @match        http://219.144.20.38:9091/*/ExamManger/OnlineTest/*
// @match        http://ks.ybcoal.com:9090/*
// @match        http://ks.ybcoal.com:9090/Content/ExamOnlineTest/*
// @match        http://ks.ybcoal.com:9090/*/ExamManger/OnlineTest/*
// @match        http://219.144.20.38:9090/*
// @match        http://219.144.20.38:9090/Content/ExamOnlineTest/*
// @match        http://219.144.20.38:9090/*/ExamManger/OnlineTest/*
// @match        http://222.91.250.74:8443/*
// @match        http://222.91.250.74:8443/Content/ExamOnlineTest/*
// @match        http://222.91.250.74:8443/*/ExamManger/OnlineTest/*
// @grant        GM_notification
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 配置：改成你的 GitHub 仓库 ====================
    const GITHUB_USER = 'wfxx2026';      // 
    const GITHUB_REPO = 'exam-helper';          // 
    const GITHUB_BRANCH = 'main';             // 

    // 远程配置地址（会自动加时间戳防缓存）
    const REMOTE_URLS = [
        `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/auth.json`,
        `https://cdn.jsdelivr.net/gh/${GITHUB_USER}/${GITHUB_REPO}@${GITHUB_BRANCH}/auth.json`
    ];
    // ================================================================

    // ==================== 全局状态管理 ====================
    window._examHelperInitialized = window._examHelperInitialized || false;
    window._examHelperElements = window._examHelperElements || {
        badge: null, startBtn: null, stopBtn: null, infoBtn: null,
        statusDiv: null, speedBtn: null
    };
    window._autoSubmitEnabled = false;

    const ConfigKeys = {
        examSpeed: "exam_speed_setting",
        pageWhitelist: "exam_page_whitelist",
        remoteAuthCache: "exam_remote_auth_cache",
        remoteAuthTime: "exam_remote_auth_time"
    };

    // ==================== 远程配置管理器 ====================
    const RemoteConfig = {
        cacheTTL: 6 * 3600 * 1000, // 本地缓存 6 小时

        async fetch() {
            const cached = this.getCache();
            // 缓存有效直接返回
            if (cached && (Date.now() - cached._timestamp < this.cacheTTL)) {
                console.log('[ExamHelper] 使用本地缓存的授权列表');
                return cached.data;
            }

            // 依次尝试每个 URL
            for (const baseUrl of REMOTE_URLS) {
                const url = baseUrl + '?_t=' + Date.now();
                try {
                    const data = await this.request(url);
                    if (data && Array.isArray(data.encryptedIDs) && data.encryptedIDs.length > 0) {
                        this.setCache(data);
                        console.log('[ExamHelper] 远程授权列表加载成功:', baseUrl);
                        return data;
                    }
                } catch (e) {
                    console.warn('[ExamHelper] 加载失败:', baseUrl, e.message);
                }
            }

            // 全部失败，用缓存（即使过期）
            if (cached) {
                console.log('[ExamHelper] 远程加载失败，使用过期的本地缓存');
                return cached.data;
            }
            return null;
        },

        request(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 8000,
                    headers: { 'Accept': 'application/json' },
                    onload: (res) => {
                        if (res.status >= 200 && res.status < 300) {
                            try {
                                resolve(JSON.parse(res.responseText));
                            } catch (e) {
                                reject(new Error('JSON解析失败'));
                            }
                        } else {
                            reject(new Error('HTTP ' + res.status));
                        }
                    },
                    onerror: () => reject(new Error('网络请求错误')),
                    ontimeout: () => reject(new Error('请求超时'))
                });
            });
        },

        getCache() {
            try {
                const raw = GM_getValue(ConfigKeys.remoteAuthCache, null);
                const time = GM_getValue(ConfigKeys.remoteAuthTime, 0);
                if (!raw) return null;
                return { data: JSON.parse(raw), _timestamp: parseInt(time) || 0 };
            } catch (e) { return null; }
        },

        setCache(data) {
            GM_setValue(ConfigKeys.remoteAuthCache, JSON.stringify(data));
            GM_setValue(ConfigKeys.remoteAuthTime, Date.now().toString());
        }
    };

    // ==================== 授权系统 ====================
    const IDCardAuth = {
        encryptedIDs: [], // 启动时从远程加载
        config: {
            expireDate: "2099-12-31",
            version: "3.9.6",
            maxActivations: 50,
            activationLockHours: 24
        },
        secretKey: "ID_AUTH_KEY_2026_V3",

        encryptIDCard: function(idCard) {
            try {
                idCard = idCard.replace(/[\s-]/g, '').toUpperCase();
                if (!/^\d{15}$/.test(idCard) && !/^\d{17}[\dX]$/.test(idCard)) return null;
                if (idCard.length === 15) {
                    idCard = idCard.substring(0, 6) + '19' + idCard.substring(6);
                    const weights = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2];
                    const checkCodes = ['1','0','X','9','8','7','6','5','4','3','2'];
                    let sum = 0;
                    for (let i = 0; i < 17; i++) sum += parseInt(idCard.charAt(i)) * weights[i];
                    idCard = idCard.substring(0, 17) + checkCodes[sum % 11];
                }
                let encrypted = "";
                const key = this.secretKey;
                for (let i = 0; i < idCard.length; i++) {
                    encrypted += String.fromCharCode(idCard.charCodeAt(i) ^ key.charCodeAt(i % key.length));
                }
                let base64 = btoa(encrypted);
                return base64.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
            } catch (e) { return null; }
        },

        validateIDCard: function(idCard) {
            idCard = idCard.trim().toUpperCase();
            if (!/^\d{15}$/.test(idCard) && !/^\d{17}[\dX]$/.test(idCard))
                return { valid: false, message: "身份证格式不正确" };
            const encrypted = this.encryptIDCard(idCard);
            if (!encrypted) return { valid: false, message: "加密失败" };
            return this.encryptedIDs.includes(encrypted)
                ? { valid: true, encryptedID: encrypted, plainID: idCard }
                : { valid: false, message: "该身份证未授权，请联系飞哥" };
        },

        getPageIDCard: function() {
            const selectors = [
                "input[type='hidden'][id*='id']", "#xxidnumber", "#idNumber",
                "#sfzh", ".sfzh", "[name='sfzh']", "body", "div", "span", "td", "label"
            ];
            for (const sel of selectors) {
                try {
                    const els = document.querySelectorAll(sel);
                    for (const el of els) {
                        let idCard = el.value || el.textContent || el.innerText || "";
                        const match = idCard.match(/\b\d{15}\b|\b\d{17}[\dX]\b/);
                        if (match) return match[0].replace(/[\s-]/g, '').toUpperCase();
                    }
                } catch (e) {}
            }
            return null;
        },

        validatePageIDCard: function(activatedIDCard) {
            const pageIDCard = this.getPageIDCard();
            if (!pageIDCard) return { valid: false, message: "页面无身份证号" };
            return activatedIDCard.replace(/[\s-]/g, '').toUpperCase() === pageIDCard.replace(/[\s-]/g, '').toUpperCase()
                ? { valid: true, pageIDCard }
                : { valid: false, message: "身份证号不匹配" };
        },

        storageKeys: {
            licenseCode: "exam_bot_license_code",
            licensePlainText: "exam_bot_license_plain_text",
            activatedDate: "exam_bot_activated_date",
            failedAttempts: "exam_bot_failed_attempts",
            lastAttemptTime: "exam_bot_last_attempt_time",
            activationCount: "exam_bot_activation_count",
            pageIDCardVerified: "exam_bot_page_id_verified"
        },

        isVideoPage: () => !!document.querySelector('video, .video-player') || document.body.innerText.includes('视频'),

        pageWhitelist: {
            get: () => GM_getValue(ConfigKeys.pageWhitelist, []),
            add: (url) => {
                let list = GM_getValue(ConfigKeys.pageWhitelist, []);
                if (!list.includes(url)) { list.push(url); GM_setValue(ConfigKeys.pageWhitelist, list); }
            },
            check: (url) => GM_getValue(ConfigKeys.pageWhitelist, []).includes(url)
        },

        checkAuthorization: function() {
            const currentURL = window.location.href;
            if (this.pageWhitelist.check(currentURL)) {
                const savedPlain = GM_getValue(this.storageKeys.licensePlainText, null);
                return { status: "authorized", idCard: savedPlain, viaWhitelist: true };
            }
            const savedID = GM_getValue(this.storageKeys.licenseCode, null);
            const savedPlain = GM_getValue(this.storageKeys.licensePlainText, null);
            const activationDate = GM_getValue(this.storageKeys.activatedDate, null);
            const pageVerified = GM_getValue(this.storageKeys.pageIDCardVerified, false);
            if (savedID && savedPlain && activationDate) {
                if (this.encryptedIDs.includes(savedID)) {
                    if (this.isVideoPage()) return { status: "authorized", idCard: savedPlain, isVideoPage: true };
                    if (!pageVerified) return { status: "needs_page_verification", idCard: savedPlain };
                    return { status: "authorized", idCard: savedPlain };
                } else return { status: "not_authorized" };
            }
            return { status: "not_authorized" };
        },

        activateIDCard: function(idCard, addToWhitelist = false) {
            const validation = this.validateIDCard(idCard);
            if (!validation.valid) { this.recordFailedAttempt(); return { success: false, message: validation.message }; }
            if (GM_getValue(this.storageKeys.activationCount, 0) >= this.config.maxActivations)
                return { success: false, message: "已达最大激活次数" };
            const pageIDCard = this.getPageIDCard();
            if (pageIDCard) {
                const pv = this.validatePageIDCard(validation.plainID);
                if (!pv.valid) return { success: false, message: pv.message, needsPageVerification: true };
            } else if (!addToWhitelist) {
                return { success: false, message: "页面无身份证号，请勾选“本页不再验证”", needsPageVerification: true };
            }
            GM_setValue(this.storageKeys.licenseCode, validation.encryptedID);
            GM_setValue(this.storageKeys.licensePlainText, validation.plainID);
            GM_setValue(this.storageKeys.activatedDate, new Date().toISOString().split('T')[0]);
            GM_setValue(this.storageKeys.pageIDCardVerified, true);
            GM_setValue(this.storageKeys.activationCount, GM_getValue(this.storageKeys.activationCount, 0) + 1);
            GM_setValue(this.storageKeys.failedAttempts, 0);
            if (addToWhitelist) this.pageWhitelist.add(window.location.href);
            return { success: true, message: "激活成功！" };
        },

        recordFailedAttempt: function() {
            let attempts = GM_getValue(this.storageKeys.failedAttempts, 0) + 1;
            GM_setValue(this.storageKeys.failedAttempts, attempts);
            GM_setValue(this.storageKeys.lastAttemptTime, Date.now());
        },

        isLocked: function() {
            const attempts = GM_getValue(this.storageKeys.failedAttempts, 0);
            if (attempts >= 10) {
                const last = GM_getValue(this.storageKeys.lastAttemptTime, 0);
                const remaining = this.config.activationLockHours * 3600000 - (Date.now() - last);
                if (remaining > 0) return { locked: true, remainingHours: Math.ceil(remaining / 3600000) };
                else GM_setValue(this.storageKeys.failedAttempts, 0);
            }
            return { locked: false };
        },

        maskIDCard: function(idCard) {
            if (!idCard) return "未授权";
            return idCard.length === 18 ? idCard.substring(0, 6) + "********" + idCard.substring(14) : idCard.substring(0, 6) + "********";
        },

        getStatusInfo: function() {
            const auth = this.checkAuthorization();
            return {
                authorized: auth.status === "authorized",
                idCard: auth.idCard ? this.maskIDCard(auth.idCard) : null,
                expireDate: this.config.expireDate,
                version: this.config.version,
                viaWhitelist: auth.viaWhitelist || false,
                isVideoPage: auth.isVideoPage || false
            };
        }
    };

    // ==================== 速度管理器 ====================
    const SpeedManager = {
        defaultSpeed: 100,
        min: 100,
        max: 15000,
        getSpeed: () => Math.min(15000, Math.max(100, GM_getValue(ConfigKeys.examSpeed, 100))),
        setSpeed: (ms) => GM_setValue(ConfigKeys.examSpeed, parseInt(ms)),
        showPanel: function() {
            const existing = document.getElementById('exam-speed-panel');
            if (existing) { existing.remove(); return; }
            const speed = this.getSpeed();
            const panel = document.createElement('div');
            panel.id = 'exam-speed-panel';
            panel.style.cssText = `
                position:fixed; bottom:420px; right:20px; width:250px;
                background:rgba(255,255,255,0.96); border-radius:12px; padding:15px;
                box-shadow:0 8px 30px rgba(0,0,0,0.25); z-index:10000;
                font-family:'Microsoft YaHei',sans-serif; border:1px solid #ddd;
            `;
            panel.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div style="font-weight:bold;color:#333;">⚡ 答题速度调节</div>
                    <button id="close-speed" style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">&times;</button>
                </div>
                <div style="margin-bottom:15px;">
                    <div style="display:flex;justify-content:space-between;font-size:12px;color:#666;margin-bottom:5px;">
                        <span>当前速度</span>
                        <span id="speed-value">${(speed/1000).toFixed(1)} 秒/题</span>
                    </div>
                    <input type="range" id="speed-slider" min="100" max="15000" value="${speed}" step="100" style="width:100%;">
                    <div style="display:flex;justify-content:space-between;font-size:10px;color:#999;">
                        <span>0.1秒</span><span>15秒</span>
                    </div>
                </div>
                <button id="save-speed" style="width:100%;padding:8px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:6px;font-weight:bold;">保存速度</button>
                <div style="margin-top:10px;font-size:10px;color:#888;">建议：学习2-5秒，刷题0.1秒</div>
            `;
            document.body.appendChild(panel);
            document.getElementById('close-speed').addEventListener('click', () => panel.remove());
            document.getElementById('save-speed').addEventListener('click', () => {
                const newSpeed = parseInt(document.getElementById('speed-slider').value);
                this.setSpeed(newSpeed);
                alert(`✅ 速度已保存为 ${(newSpeed/1000).toFixed(1)} 秒/题`);
                panel.remove();
            });
            document.getElementById('speed-slider').addEventListener('input', function() {
                document.getElementById('speed-value').textContent = (this.value/1000).toFixed(1) + ' 秒/题';
            });
            setTimeout(() => {
                const handler = (e) => {
                    if (!panel.contains(e.target) && e.target.id !== 'exam-helper-speed') {
                        panel.remove(); document.removeEventListener('click', handler);
                    }
                };
                document.addEventListener('click', handler);
            }, 100);
        }
    };

    // ==================== 核心逻辑 ====================

    function cleanupExistingElements() {
        ['exam-helper-auth-badge','exam-helper-start','exam-helper-stop','exam-helper-info',
         'exam-helper-status','exam-helper-auto-submit','exam-helper-speed','exam-helper-wechat',
         'exam-speed-panel','wechat-qr-popup','license-auth','page-verification'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }

    function injectStyles() {
        if (document.getElementById('exam-helper-styles')) return;
        GM_addStyle(`
            .exam-helper-btn {
                position:fixed; z-index:9998; padding:8px 12px;
                border-radius:20px; font-size:12px; font-weight:bold;
                cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.2);
                transition:all 0.3s; border:none; outline:none;
                display:flex; align-items:center; gap:5px;
                opacity:0.7; backdrop-filter:blur(5px);
            }
            .exam-helper-btn:hover { opacity:1; transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.3); }
            .exam-helper-btn-start { background:linear-gradient(135deg,#667eea,#764ba2); color:white; right:20px; bottom:150px; }
            .exam-helper-btn-stop { background:linear-gradient(135deg,#f093fb,#f5576c); color:white; right:20px; bottom:150px; }
            .exam-helper-btn-auto-submit { background:linear-gradient(135deg,#ff7e5f,#feb47b); color:white; right:20px; bottom:200px; }
            .exam-helper-btn-auto-submit.active { background:linear-gradient(135deg,#00b09b,#96c93d); }
            .exam-helper-btn-speed { background:linear-gradient(135deg,#FF9800,#FF5722); color:white; right:20px; bottom:250px; }
            .exam-helper-status {
                position:fixed; right:20px; top:80px; background:rgba(0,0,0,0.7); color:white;
                padding:6px 10px; border-radius:6px; font-size:10px; z-index:9997;
                display:none; max-width:200px; backdrop-filter:blur(5px);
                border-left:2px solid #00b09b; opacity:0; transition:opacity 0.3s;
            }
            .exam-helper-status.show { display:block; opacity:1; animation:fadeInStatus 0.3s; }
            @keyframes fadeInStatus {
                from { opacity:0; transform:translateY(-10px); }
                to { opacity:1; transform:translateY(0); }
            }
            .exam-helper-auth-badge {
                position:fixed; top:10px; right:10px; background:rgba(0,176,155,0.8);
                color:white; padding:4px 8px; border-radius:15px; font-size:10px;
                z-index:9996; backdrop-filter:blur(5px); opacity:0.7; cursor:pointer;
                display:flex; align-items:center; gap:4px;
            }
            .exam-helper-auth-badge:hover { opacity:1; }
        `);
        const s = document.createElement('style');
        s.id = 'exam-helper-styles';
        document.head.appendChild(s);
    }

    function createAuthBadge() {
        if (document.getElementById('exam-helper-auth-badge')) return;
        const info = IDCardAuth.getStatusInfo();
        const badge = document.createElement('div');
        badge.id = 'exam-helper-auth-badge';
        badge.className = 'exam-helper-auth-badge';
        badge.innerHTML = `<span>✓ ${info.idCard?.substring(12) || '白名单'}</span>`;
        badge.title = '已授权（点击查看详情）';
        document.body.appendChild(badge);
        badge.addEventListener('click', showLicenseInfo);
    }

    function showLicenseInfo() {
        const existing = document.getElementById('license-info-popup');
        if (existing) existing.remove();
        const info = IDCardAuth.getStatusInfo();
        const div = document.createElement('div');
        div.id = 'license-info-popup';
        div.className = 'exam-helper-status show';
        div.style.top = '40px';
        div.style.right = '10px';
        div.style.maxWidth = '260px';
        div.innerHTML = `
            <div style="font-weight:bold;font-size:11px;">授权信息</div>
            <div style="font-size:9px;">激活: ${info.idCard}</div>
            ${info.viaWhitelist ? '<div style="font-size:9px;color:#4CAF50;">✅ 白名单免验证</div>' : ''}
            <div style="font-size:9px;">到期: ${info.expireDate}</div>
            <div style="font-size:9px;color:#4facfe;">版本: v${info.version}</div>
            <div style="margin-top:5px;font-size:8px;opacity:0.5;">点击任意处关闭</div>
        `;
        document.body.appendChild(div);
        setTimeout(() => {
            const handler = (e) => {
                if (!div.contains(e.target) && e.target.id !== 'exam-helper-auth-badge') {
                    div.style.opacity = '0';
                    setTimeout(() => div.remove(), 300);
                    document.removeEventListener('click', handler);
                }
            };
            document.addEventListener('click', handler);
        }, 100);
    }

    function createControlPanel() {
        const statusDiv = document.createElement('div');
        statusDiv.id = 'exam-helper-status';
        statusDiv.className = 'exam-helper-status';
        document.body.appendChild(statusDiv);

        const speedBtn = document.createElement('button');
        speedBtn.id = 'exam-helper-speed';
        speedBtn.className = 'exam-helper-btn exam-helper-btn-speed';
        speedBtn.innerHTML = '⚡答题速度';
        speedBtn.title = '调节答题速度 (Ctrl+Alt+D)';
        document.body.appendChild(speedBtn);

        const autoBtn = document.createElement('button');
        autoBtn.id = 'exam-helper-auto-submit';
        autoBtn.className = 'exam-helper-btn exam-helper-btn-auto-submit';
        autoBtn.innerHTML = '自动交卷(关)';
        autoBtn.title = '开启/关闭自动交卷 (Ctrl+Alt+A)';
        document.body.appendChild(autoBtn);

        const startBtn = document.createElement('button');
        startBtn.id = 'exam-helper-start';
        startBtn.className = 'exam-helper-btn exam-helper-btn-start';
        startBtn.innerHTML = '▶开始答题';
        startBtn.title = '开始自动答题 (Ctrl+Alt+S)';
        document.body.appendChild(startBtn);

        const stopBtn = document.createElement('button');
        stopBtn.id = 'exam-helper-stop';
        stopBtn.className = 'exam-helper-btn exam-helper-btn-stop';
        stopBtn.innerHTML = '停止答题';
        stopBtn.title = '停止自动答题 (Ctrl+Alt+P)';
        stopBtn.style.display = 'none';
        document.body.appendChild(stopBtn);

        autoBtn.addEventListener('click', () => {
            window._autoSubmitEnabled = !window._autoSubmitEnabled;
            autoBtn.innerHTML = window._autoSubmitEnabled ? '自动交卷(开)' : '自动交卷(关)';
            autoBtn.classList.toggle('active', window._autoSubmitEnabled);
            showStatus(window._autoSubmitEnabled ? '✅ 自动交卷已开启' : '⏹️ 自动交卷已关闭', 2000);
        });

        window._examHelperElements = { statusDiv, speedBtn, startBtn, stopBtn };
    }

    function showStatus(msg, dur = 2000) {
        const el = document.getElementById('exam-helper-status');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        if (dur > 0) setTimeout(() => el.classList.remove('show'), dur);
    }

    function getCurrentQuestionNumber() {
        if (window.onlineCur) return parseInt(window.onlineCur);
        const visible = document.querySelector('.single-box[style*="display: block"] a[name]');
        if (visible) return parseInt(visible.name);
        const first = document.querySelector('.single-main a[name]');
        if (first) return parseInt(first.name);
        return 1;
    }

    function getTotalQuestions() {
        if (window.onlineCount && !isNaN(window.onlineCount)) return parseInt(window.onlineCount);
        const boxes = document.querySelectorAll('.single-box');
        if (boxes.length) return boxes.length;
        const nums = document.querySelectorAll('.title_num a');
        if (nums.length) return nums.length;
        return 30;
    }

    function goToQuestion(qNum) {
        if (typeof window.move2 === 'function') { window.move2(qNum); return; }
        const btn = document.getElementById(`${qNum}aa`);
        if (btn) {
            document.querySelectorAll('.title_num a').forEach(a => a.className = 'btn btn-default');
            btn.className = 'btn btn-primary';
        }
    }

    function answerQuestion(questionId) {
        const ans = document.getElementById(`${questionId}bzda`)?.value?.trim();
        if (!ans) return false;
        let answered = false;
        if (/^[A-D]$/.test(ans)) {
            const radio = document.getElementById(`${questionId}|${ans.charCodeAt(0) - 64}`);
            if (radio) { radio.click(); answered = true; }
        } else if (/^[A-H]{2,}$/.test(ans)) {
            for (const ch of ans) {
                const cb = document.getElementById(`${questionId}|${ch.charCodeAt(0) - 64}`);
                if (cb) { cb.click(); answered = true; }
            }
        } else if (ans === '对' || ans === 'Y') {
            const radio = document.getElementById(`${questionId}|1`);
            if (radio) { radio.click(); answered = true; }
        } else if (ans === '错' || ans === 'N') {
            const radio = document.getElementById(`${questionId}|2`);
            if (radio) { radio.click(); answered = true; }
        }
        if (answered) {
            const pb = document.getElementById(`${questionId}aa`);
            if (pb) pb.className = 'btn btn-success';
        }
        return answered;
    }

    function goToNextQuestion() {
        if (typeof window.questionsAdd === 'function') { window.questionsAdd(); return true; }
        const nextBtn = document.querySelector('a[onclick*="questionsAdd"]');
        if (nextBtn) { nextBtn.click(); return true; }
        return false;
    }

    function autoSubmitAndFinishExam() {
        showStatus('📤 正在交卷...', 3000);
        if (typeof window.JiaoJuan === 'function') window.JiaoJuan();
        else {
            const btn = document.querySelector('.overtest, #Img2, [onclick*="JiaoJuan"]');
            if (btn) btn.click();
            else if (window.vData?.ksmxid && window.vData?.PersonId) {
                window.location.href = `/Bus/ExamManger/OnlineTest/JiaoJuan?ksmxid=${window.vData.ksmxid}&personId=${window.vData.PersonId}`;
                return;
            }
        }
        setTimeout(() => {
            const confirmBtn = document.querySelector('[onclick*="JiaoJuan"][data-dismiss="modal"]');
            if (confirmBtn) {
                confirmBtn.click();
                setTimeout(() => {
                    if (typeof window.SleepClose === 'function') { window.SleepClose(); showStatus('🎉 考试已结束！', 5000); }
                    else { const endBtn = document.getElementById('btnClose'); if (endBtn) endBtn.click(); }
                }, 1500);
            }
        }, 1000);
    }

    function startAutoAnswer() {
        if (IDCardAuth.checkAuthorization().status !== "authorized") { showStatus('❌ 验证失效'); return; }
        let cur = getCurrentQuestionNumber();
        const total = getTotalQuestions();
        const speed = SpeedManager.getSpeed();
        document.getElementById('exam-helper-stop').style.display = 'block';
        document.getElementById('exam-helper-start').style.display = 'none';
        showStatus(`🚀 开始答题(共${total}题 ${(speed/1000).toFixed(1)}s/题)`);
        if (window._examHelperTimer) clearInterval(window._examHelperTimer);
        window._examHelperTimer = setInterval(() => {
            if (cur > total) {
                clearInterval(window._examHelperTimer);
                showStatus('🎉 全部完成！', 3000);
                if (window._autoSubmitEnabled) setTimeout(autoSubmitAndFinishExam, 1500);
                document.getElementById('exam-helper-stop').style.display = 'none';
                document.getElementById('exam-helper-start').style.display = 'block';
                return;
            }
            goToQuestion(cur);
            setTimeout(() => {
                const answered = answerQuestion(cur);
                showStatus(`${answered ? '✅' : '⏭️'} 第 ${cur}/${total} 题`, 800);
                setTimeout(() => { goToNextQuestion(); cur++; }, speed * 0.3);
            }, speed * 0.5);
        }, speed);
    }

    function stopAutoAnswer() {
        if (window._examHelperTimer) { clearInterval(window._examHelperTimer); window._examHelperTimer = null; }
        showStatus('⏹️ 已停止', 2000);
        document.getElementById('exam-helper-stop').style.display = 'none';
        document.getElementById('exam-helper-start').style.display = 'block';
    }

    function registerEvents() {
        document.getElementById('exam-helper-start').addEventListener('click', () => { showStatus('🚀 开始...', 1000); setTimeout(startAutoAnswer, 500); });
        document.getElementById('exam-helper-stop').addEventListener('click', stopAutoAnswer);
        document.getElementById('exam-helper-speed').addEventListener('click', () => SpeedManager.showPanel());

        if (!document._examHelperKeyListener) {
            document.addEventListener('keydown', (e) => {
                if (!e.ctrlKey || !e.altKey) return;
                if (e.key === 's') { e.preventDefault(); startAutoAnswer(); }
                else if (e.key === 'p') { e.preventDefault(); stopAutoAnswer(); }
                else if (e.key === 'a') { e.preventDefault(); document.getElementById('exam-helper-auto-submit').click(); }
                else if (e.key === 'd') { e.preventDefault(); SpeedManager.showPanel(); }
            });
            document._examHelperKeyListener = true;
        }
    }

    function initializeMainProgram() {
        const auth = IDCardAuth.checkAuthorization();
        if (auth.status !== "authorized") return;
        if (!IDCardAuth.isVideoPage() && !auth.viaWhitelist) {
            const pv = IDCardAuth.validatePageIDCard(auth.idCard);
            if (!pv.valid) { showPageVerificationRequired(auth.idCard); return; }
        }

        cleanupExistingElements();
        injectStyles();
        createAuthBadge();
        createControlPanel();

        const total = getTotalQuestions();
        showStatus(`✅ 助手已就绪(共${total}题，可调速)`, 2000);

        registerEvents();
        if (document.readyState === 'loading')
            document.addEventListener('DOMContentLoaded', () => setTimeout(init, 1500));
        else setTimeout(init, 1500);
    }

    function showPageVerificationRequired(idCard) {
        const div = document.createElement('div');
        div.id = 'page-verification';
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#ff7e5f,#feb47b);z-index:9999;display:flex;justify-content:center;align-items:center;font-family:Microsoft YaHei;';
        div.innerHTML = `
            <div style="background:rgba(255,255,255,0.95);border-radius:20px;padding:40px;text-align:center;max-width:500px;width:90%;">
                <div style="font-size:60px;">🔄</div>
                <div style="font-size:24px;font-weight:bold;color:#333;">需要重新验证身份</div>
                <div style="font-size:14px;color:#666;margin:20px 0;">页面身份信息已变更</div>
                <div style="padding:20px;background:#f8f9fa;border-radius:12px;margin-bottom:25px;">
                    <div>已激活身份证:</div>
                    <div style="font-family:monospace;font-size:18px;color:#667eea;">${IDCardAuth.maskIDCard(idCard)}</div>
                </div>
                <button id="verify-page-btn" style="background:linear-gradient(135deg,#ff7e5f,#feb47b);color:white;border:none;padding:16px 40px;border-radius:25px;font-size:16px;cursor:pointer;width:100%;margin-bottom:15px;">重新验证页面身份</button>
                <button id="logout-btn" style="background:#f8f9fa;color:#666;border:1px solid #ddd;padding:12px 30px;border-radius:25px;width:100%;">退出当前账户</button>
            </div>
        `;
        document.body.appendChild(div);
        document.getElementById('verify-page-btn').addEventListener('click', function() {
            this.innerHTML = '验证中...'; this.disabled = true;
            setTimeout(() => {
                const pageIDCard = IDCardAuth.getPageIDCard();
                if (pageIDCard && idCard.replace(/[\s-]/g, '').toUpperCase() === pageIDCard.replace(/[\s-]/g, '').toUpperCase()) {
                    GM_setValue(IDCardAuth.storageKeys.pageIDCardVerified, true);
                    this.innerHTML = '✅ 验证成功'; this.style.background = 'linear-gradient(135deg,#00b09b,#96c93d)';
                    setTimeout(() => { div.remove(); location.reload(); }, 1000);
                } else {
                    this.innerHTML = '重新验证页面身份'; this.disabled = false;
                }
            }, 500);
        });
        document.getElementById('logout-btn').addEventListener('click', () => {
            GM_setValue(IDCardAuth.storageKeys.licenseCode, null);
            GM_setValue(IDCardAuth.storageKeys.licensePlainText, null);
            GM_setValue(IDCardAuth.storageKeys.pageIDCardVerified, false);
            div.remove(); location.reload();
        });
    }

    function showLockedMessage(hours) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#f093fb,#f5576c);z-index:9999;display:flex;justify-content:center;align-items:center;font-family:Microsoft YaHei;color:white;';
        div.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:60px;">🔒</div>
                <div style="font-size:24px;font-weight:bold;">激活功能已锁定</div>
                <div style="font-size:16px;opacity:0.9;margin:15px 0;">多次验证失败，系统已暂时锁定</div>
                <div style="background:rgba(255,255,255,0.2);border-radius:10px;padding:15px;max-width:300px;margin:20px auto;">
                    <div style="font-size:14px;">剩余锁定时间:</div>
                    <div style="font-size:28px;font-weight:bold;">${hours} 小时</div>
                </div>
                <button id="try-again-btn" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:white;padding:10px 20px;border-radius:20px;cursor:pointer;">返回重新验证</button>
            </div>
        `;
        document.body.appendChild(div);
        document.getElementById('try-again-btn').addEventListener('click', () => location.reload());
    }

    function showIDCardAuth() {
        const lock = IDCardAuth.isLocked();
        if (lock.locked) { showLockedMessage(lock.remainingHours); return; }
        const authDiv = document.createElement('div');
        authDiv.id = 'license-auth';
        authDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#667eea,#764ba2);z-index:9999;display:flex;justify-content:center;align-items:center;';
        authDiv.innerHTML = `
            <div style="background:rgba(255,255,255,0.95);border-radius:20px;padding:40px;width:90%;max-width:500px;text-align:center;">
                <div style="font-size:30px;">🔐</div>
                <div style="font-size:24px;font-weight:bold;color:#333;">身份证双重验证</div>
                <div style="font-size:14px;color:#666;margin:20px 0;">输入已授权身份证号激活<br><span style="color:#ff6b6b;">（若无页面身份证，请勾选下方白名单）</span></div>
                <input type="text" id="idcard-input" placeholder="18位身份证号" maxlength="18" style="width:100%;padding:14px;border:2px solid #e1e5e9;border-radius:12px;font-size:18px;text-align:center;font-family:monospace;">
                <div id="license-error" style="color:#ff4757;font-size:12px;margin-top:8px;display:none;"></div>
                <div id="page-id-info" style="margin-top:15px;padding:10px;background:#f8f9fa;border-radius:8px;font-size:12px;display:none;">
                    <div>当前页面身份证:</div><div id="page-id-value" style="font-family:monospace;font-size:14px;"></div>
                </div>
                <label style="display:flex;align-items:center;justify-content:center;margin-top:15px;font-size:12px;color:#666;cursor:pointer;">
                    <input type="checkbox" id="whitelist-checkbox" style="margin-right:8px;">本页不再验证（顺序练习等）
                </label>
                <button id="activate-btn" style="width:100%;padding:14px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:25px;font-size:16px;font-weight:bold;margin-top:20px;">开始双重验证</button>
                <div style="margin-top:15px;">
                    <a href="#" id="detect-page-id" style="color:#667eea;font-size:14px;">检测页面身份证</a>
                </div>
                <div style="background:#f8f9fa;border-radius:12px;padding:15px;font-size:12px;color:#666;text-align:left;margin-top:20px;">
                    <div>版本: v${IDCardAuth.config.version}</div>
                    <div>到期: ${IDCardAuth.config.expireDate}</div>
                    <div style="text-align:center;margin-top:10px;">© 2026 飞哥</div>
                </div>
            </div>
        `;
        document.body.appendChild(authDiv);
        document.getElementById('idcard-input').focus();
        document.getElementById('activate-btn').addEventListener('click', function() {
            const idCard = document.getElementById('idcard-input').value.trim();
            const errorDiv = document.getElementById('license-error');
            const addToWhitelist = document.getElementById('whitelist-checkbox').checked;
            if (!idCard) { errorDiv.style.display = 'block'; errorDiv.textContent = '请输入身份证号'; return; }
            this.innerHTML = '验证中...'; this.disabled = true;
            setTimeout(() => {
                const result = IDCardAuth.activateIDCard(idCard, addToWhitelist);
                if (result.success) {
                    authDiv.style.opacity = '0';
                    setTimeout(() => { authDiv.remove(); location.reload(); }, 500);
                } else {
                    this.innerHTML = '开始双重验证'; this.disabled = false;
                    errorDiv.style.display = 'block'; errorDiv.textContent = result.message;
                    document.getElementById('idcard-input').style.borderColor = '#ff4757';
                    if (result.needsPageVerification) {
                        const pageID = IDCardAuth.getPageIDCard();
                        if (pageID) {
                            document.getElementById('page-id-value').textContent = IDCardAuth.maskIDCard(pageID);
                            document.getElementById('page-id-info').style.display = 'block';
                        }
                    }
                }
            }, 800);
        });
        document.getElementById('detect-page-id').addEventListener('click', function(e) {
            e.preventDefault();
            const pageID = IDCardAuth.getPageIDCard();
            const errorDiv = document.getElementById('license-error');
            if (pageID) {
                document.getElementById('page-id-value').textContent = IDCardAuth.maskIDCard(pageID);
                document.getElementById('page-id-info').style.display = 'block';
                document.getElementById('idcard-input').value = pageID;
                errorDiv.style.display = 'block'; errorDiv.textContent = '✅ 已检测到页面身份证'; errorDiv.style.color = '#00b09b';
            } else {
                errorDiv.style.display = 'block'; errorDiv.textContent = '❌ 未检测到页面身份证，请勾选白名单'; errorDiv.style.color = '#ff4757';
            }
        });
        document.getElementById('idcard-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') document.getElementById('activate-btn').click(); });
    }

    // ==================== 异步启动入口 ====================
    (async function main() {
        if (window._examHelperInitialized) return;

        // 1. 先加载远程授权列表
        showStatus('🌐 正在连接授权服务器...', 0);
        const remoteConfig = await RemoteConfig.fetch();

        if (remoteConfig && Array.isArray(remoteConfig.encryptedIDs)) {
            IDCardAuth.encryptedIDs = remoteConfig.encryptedIDs;
            // 可选：覆盖其他远程配置
            if (remoteConfig.features) {
                if (remoteConfig.features.maxActivations) IDCardAuth.config.maxActivations = remoteConfig.features.maxActivations;
                if (remoteConfig.features.activationLockHours) IDCardAuth.config.activationLockHours = remoteConfig.features.activationLockHours;
            }
            if (remoteConfig.version) IDCardAuth.config.version = remoteConfig.version;
            console.log('[ExamHelper] 授权列表加载完成，共', remoteConfig.encryptedIDs.length, '个授权用户');
        } else {
            console.warn('[ExamHelper] 未能加载远程授权列表，授权功能可能不可用');
        }

        // 2. 执行原有授权检查逻辑
        const authStatus = IDCardAuth.checkAuthorization();
        if (authStatus.status === "authorized") {
            window._examHelperInitialized = true;
            initializeMainProgram();
        } else if (authStatus.status === "needs_page_verification") {
            if (IDCardAuth.isVideoPage()) {
                window._examHelperInitialized = true;
                initializeMainProgram();
            } else {
                showPageVerificationRequired(authStatus.idCard);
            }
        } else {
            showIDCardAuth();
        }
    })();

})();
