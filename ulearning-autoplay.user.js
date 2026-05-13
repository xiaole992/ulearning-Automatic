// ==UserScript==
// @name         东莞理工ulearning 自动倍速刷课脚本
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  自动倍速播放 ulearning.cn 视频课程，自动跳转下一节
// @author       You
// @match        https://ua.ulearning.cn/*
// @grant        none
// @run-at       document-idle
// @license MIT
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置区 ====================
    const CONFIG = {
        playbackRate: 8,          // 播放倍率，默认8倍（可改为 2/4/8/16）
        autoPlay: true,            // 是否自动播放
        autoNext: true,            // 是否自动跳转下一节
        autoMute: true,            // 是否自动静音
        skipInterval: 3000,        // 检测间隔（毫秒）
        retryInterval: 2000,       // 重试间隔
        maxRetry: 10,              // 最大重试次数
        debug: false,              // 调试模式
    };

    // ==================== 日志 ====================
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[U-Learning助手]', ...args);
        }
    }

    function info(...args) {
        console.log('%c[U-Learning助手]', 'color: #4CAF50; font-weight: bold;', ...args);
    }

    // ==================== 控制面板 ====================
    function createControlPanel() {
        const panel = document.createElement('div');
        panel.id = 'ul-helper-panel';
        panel.innerHTML = `
            <div id="ul-helper-header">U-Learning 助手</div>
            <div class="ul-helper-row">
                <label>倍率:</label>
                <select id="ul-rate-select">
                    <option value="1">1x</option>
                    <option value="2">2x</option>
                    <option value="4">4x</option>
                    <option value="8" selected>8x</option>
                    <option value="16">16x</option>
                  
                </select>
            </div>
            <div class="ul-helper-row">
                <label>自动播放:</label>
                <input type="checkbox" id="ul-autoplay" ${CONFIG.autoPlay ? 'checked' : ''}>
            </div>
            <div class="ul-helper-row">
                <label>自动下一节:</label>
                <input type="checkbox" id="ul-autonext" ${CONFIG.autoNext ? 'checked' : ''}>
            </div>
            <div class="ul-helper-row">
                <label>静音:</label>
                <input type="checkbox" id="ul-mute" ${CONFIG.autoMute ? 'checked' : ''}>
            </div>
            <div id="ul-helper-status">等待检测视频...</div>
            <button id="ul-helper-resume" style="display:none;">▶ 恢复自动播放</button>
            <button id="ul-helper-toggle">收起</button>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #ul-helper-panel {
                position: fixed;
                top: 10px;
                right: 10px;
                z-index: 999999;
                background: rgba(30, 30, 50, 0.95);
                color: #fff;
                padding: 0;
                border-radius: 10px;
                font-size: 13px;
                font-family: "Microsoft YaHei", sans-serif;
                box-shadow: 0 4px 20px rgba(0,0,0,0.4);
                min-width: 200px;
                backdrop-filter: blur(10px);
                transition: all 0.3s ease;
                overflow: hidden;
            }
            #ul-helper-panel.collapsed {
                min-width: auto;
            }
            #ul-helper-panel.collapsed > *:not(#ul-helper-header):not(#ul-helper-toggle) {
                display: none;
            }
            #ul-helper-header {
                padding: 10px 14px;
                background: linear-gradient(135deg, #4CAF50, #2196F3);
                font-weight: bold;
                font-size: 14px;
                cursor: move;
                user-select: none;
            }
            .ul-helper-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 14px;
            }
            .ul-helper-row label {
                flex: 1;
            }
            .ul-helper-row select, .ul-helper-row input[type="checkbox"] {
                cursor: pointer;
            }
            .ul-helper-row select {
                background: #333;
                color: #fff;
                border: 1px solid #555;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 13px;
            }
            #ul-helper-status {
                padding: 8px 14px;
                font-size: 12px;
                color: #8bc34a;
                border-top: 1px solid rgba(255,255,255,0.1);
                margin-top: 4px;
                word-break: break-all;
            }
            #ul-helper-toggle {
                display: block;
                width: 100%;
                padding: 6px;
                background: rgba(255,255,255,0.05);
                border: none;
                color: #aaa;
                cursor: pointer;
                font-size: 12px;
                transition: background 0.2s;
            }
            #ul-helper-toggle:hover {
                background: rgba(255,255,255,0.1);
                color: #fff;
            }
            #ul-helper-resume {
                display: block;
                width: calc(100% - 28px);
                margin: 6px 14px;
                padding: 6px 0;
                background: linear-gradient(135deg, #4CAF50, #2196F3);
                border: none;
                border-radius: 5px;
                color: #fff;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
                transition: opacity 0.2s;
            }
            #ul-helper-resume:hover {
                opacity: 0.85;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(panel);

        // 面板折叠
        const toggleBtn = panel.querySelector('#ul-helper-toggle');
        toggleBtn.addEventListener('click', () => {
            panel.classList.toggle('collapsed');
            toggleBtn.textContent = panel.classList.contains('collapsed') ? '展开' : '收起';
        });

        // 恢复自动播放按钮
        const resumeBtn = panel.querySelector('#ul-helper-resume');
        resumeBtn.addEventListener('click', () => {
            getAllVideos().forEach(video => {
                video._ulUserPaused = false;
                lastResumeTime.delete(video);
                tryPlayVideo(video);
            });
            resumeBtn.style.display = 'none';
            info('用户恢复自动播放');
        });

        // 倍率切换
        panel.querySelector('#ul-rate-select').addEventListener('change', (e) => {
            CONFIG.playbackRate = parseFloat(e.target.value);
            info('倍率切换为:', CONFIG.playbackRate);
            applyRateToAllVideos();
        });

        // 自动播放
        panel.querySelector('#ul-autoplay').addEventListener('change', (e) => {
            CONFIG.autoPlay = e.target.checked;
        });

        // 自动下一节
        panel.querySelector('#ul-autonext').addEventListener('change', (e) => {
            CONFIG.autoNext = e.target.checked;
        });

        // 静音
        panel.querySelector('#ul-mute').addEventListener('change', (e) => {
            CONFIG.autoMute = e.target.checked;
            applyMuteToAllVideos();
        });

        // 拖动
        makeDraggable(panel, panel.querySelector('#ul-helper-header'));
    }

    function makeDraggable(el, handle) {
        let startX, startY, initLeft, initTop;
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            const rect = el.getBoundingClientRect();
            initLeft = rect.left;
            initTop = rect.top;
            const onMove = (e) => {
                el.style.left = (initLeft + e.clientX - startX) + 'px';
                el.style.top = (initTop + e.clientY - startY) + 'px';
                el.style.right = 'auto';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    function updateStatus(text) {
        const statusEl = document.querySelector('#ul-helper-status');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    // ==================== 获取页面上的 viewProgress 值 ====================
    // 优先：从平台 ViewModel 直接读取（window.test.currentPage → video element → viewProgress）
    // 次选：DOM 选择器兜底
    function getViewProgress() {
        // 方式1：从平台 ViewModel 直接读取（最可靠，完全绕过 DOM 查询）
        try {
            const vm = window.test;
            if (vm && typeof vm === 'object') {
                const page = vm.currentPage ? vm.currentPage() : null;
                if (page && page.pageElements) {
                    const elements = page.pageElements();
                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        // type == 4 为视频元素
                        if (el.type && el.type() === 4) {
                            const record = el.record ? el.record() : null;
                            if (record && typeof record.viewProgress === 'function') {
                                const vp = parseFloat(record.viewProgress());
                                if (!isNaN(vp) && vp >= 0) {
                                    log(`从ViewModel读取 viewProgress=${vp}`);
                                    return vp;
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            log('ViewModel读取失败:', e.message);
        }

        // 方式2：DOM 兜底（与 video 关联的 viewProgress 元素）
        // 找当前正在播放的 video 元素的相邻 viewProgress 元素
        const videos = document.querySelectorAll('video');
        for (const video of videos) {
            if (video.paused && video.ended === false && video.readyState < 2) continue;
            // 向上查找包含 viewProgress 的容器
            const container = video.closest('.pageElement, .video-wrapper, [id*="pageElement"]');
            if (container) {
                const el = container.querySelector('[data-bind*="viewProgress"]');
                if (el) {
                    const val = parseFloat(el.textContent.trim());
                    if (!isNaN(val) && val >= 0) return val;
                }
            }
        }

        // 方式3：页面级 viewProgress（用于非视频页面的进度条）
        const pageEl = document.querySelector('[data-bind*="pageElement.record().viewProgress"]');
        if (pageEl) {
            const val = parseFloat(pageEl.textContent.trim());
            if (!isNaN(val) && val >= 0) return val;
        }

        return null;
    }

    // ==================== 视频卡顿（转圈加载）检测与修复 ====================
    const STALL_THRESHOLD = 6;           // viewProgress 超过6秒没增加视为卡住
    const stallLastProgress = new WeakMap();   // 上次记录的 viewProgress 值
    const stallLastRecordTime = new WeakMap(); // 上次记录时的时间戳
    const stallNudgeCount = new WeakMap();     // 连续 nudge 次数（避免无限重试）
    const MAX_NUDGE = 5;                      // 最多 nudge 次数

    function checkVideoStall(video) {
        if (video.ended || video.paused || video._ulUserPaused) return;

        const progress = getViewProgress();
        if (progress === null) {
            // 页面没有 viewProgress 元素，降级为 currentTime 检测
            checkVideoStallByTime(video);
            return;
        }

        const now = Date.now();
        const lastP = stallLastProgress.get(video);
        const lastRecordTime = stallLastRecordTime.get(video);

        if (lastP !== undefined && lastRecordTime !== undefined) {
            const timeElapsed = (now - lastRecordTime) / 1000;
            // 超过阈值但 viewProgress 没增加，说明卡住了
            if (timeElapsed >= STALL_THRESHOLD && Math.abs(progress - lastP) < 0.1) {
                const nudged = stallNudgeCount.get(video) || 0;
                if (nudged >= MAX_NUDGE) {
                    log('卡顿修复次数已达上限，暂停自动修复，等待正常看完');
                    updateStatus('⚠ 卡顿多次无法恢复，请手动检查');
                    stallNudgeCount.set(video, 0);  // 重置，等待 viewProgress 正常增长
                    return;
                }

                stallNudgeCount.set(video, nudged + 1);
                info(`视频卡住 (viewProgress=${progress.toFixed(1)} 未变化)，第${nudged + 1}次修复`);

                // 模拟手动拉进度条：微调 currentTime 向前跳一小步
                const nudgeAmount = 0.5;
                const newTime = Math.min(video.currentTime + nudgeAmount, video.duration - 0.1);
                video.currentTime = newTime;

                // 同时确保在播放状态
                if (video.paused) {
                    video.play().catch(() => {});
                }

                updateStatus(`🔄 卡顿修复中 (${nudged + 1}/${MAX_NUDGE})`);
            } else if (progress > lastP + 0.1) {
                // viewProgress 在增加，正常播放，重置 nudge 计数
                stallNudgeCount.set(video, 0);
            }
        }

        stallLastProgress.set(video, progress);
        stallLastRecordTime.set(video, now);
    }

    // 降级：基于 currentTime 的卡顿检测（无 viewProgress 元素时使用）
    const stallLastCT = new WeakMap();
    const stallLastCTTime = new WeakMap();

    function checkVideoStallByTime(video) {
        const now = Date.now();
        const currentT = video.currentTime;
        const lastT = stallLastCT.get(video);
        const lastTime = stallLastCTTime.get(video);

        if (lastT !== undefined && lastTime !== undefined) {
            const timeElapsed = (now - lastTime) / 1000;
            if (timeElapsed >= STALL_THRESHOLD && Math.abs(currentT - lastT) < 0.5) {
                const nudged = stallNudgeCount.get(video) || 0;
                if (nudged >= MAX_NUDGE) {
                    log('降级模式卡顿修复次数已达上限，暂停修复');
                    updateStatus('⚠ 视频卡住多次无法恢复，请手动检查');
                    stallNudgeCount.set(video, 0);
                    return;
                }
                stallNudgeCount.set(video, nudged + 1);
                video.currentTime = Math.min(currentT + 0.5, video.duration - 0.1);
                if (video.paused) video.play().catch(() => {});
                updateStatus(`🔄 卡顿修复中 (降级模式 ${nudged + 1}/${MAX_NUDGE})`);
            } else {
                stallNudgeCount.set(video, 0);
            }
        }

        stallLastCT.set(video, currentT);
        stallLastCTTime.set(video, now);
    }

    // ==================== 已看完视频检测与跳过 ====================
    const FINISHED_CONFIRM_COUNT = 3;  // 连续检测到 >= 95 的次数（防误判）
    let finishConfirmCount = 0;        // 当前连续确认计数器
    let finishConfirmEl = null;        // 确认来源的元素（用于判断是否为同一元素）
    const finishConfirmThreshold = 95; // 平台判定"已看完"的阈值

    function isCurrentVideoFinished() {
        // 方式1：直接读取 viewProgress 数值（最可靠）
        const progress = getViewProgress();
        const vpEl = document.querySelector('[data-bind*="viewProgress"]:not([style*="display:none"]):not([style*="display: none"])');

        if (progress !== null) {
            // 双重确认：在同一元素上连续多次检测到 >= 95 才认定完成
            if (progress >= finishConfirmThreshold) {
                if (finishConfirmEl === vpEl) {
                    finishConfirmCount++;
                    log(`viewProgress=${progress}，确认中 (${finishConfirmCount}/${FINISHED_CONFIRM_COUNT})`);
                } else {
                    finishConfirmCount = 1;
                    finishConfirmEl = vpEl;
                    log(`viewProgress=${progress}，开始确认`);
                }
                if (finishConfirmCount >= FINISHED_CONFIRM_COUNT) {
                    info(`viewProgress=${progress} 连续确认 ${FINISHED_CONFIRM_COUNT} 次，已看完`);
                    finishConfirmCount = 0;  // 重置
                    finishConfirmEl = null;
                    return true;
                }
            } else {
                // viewProgress 下降（切章节后数值重置），重置计数
                finishConfirmCount = 0;
                finishConfirmEl = null;
            }
        }

        // 方式2：检测 DOM 中的"已看完"文本（直接确认，无需双重）
        const finishedTexts = document.querySelectorAll(
            'span[data-bind*="finished"], .text span'
        );
        for (const el of finishedTexts) {
            const text = el.textContent.trim();
            if (text === '已看完' || text === 'Finished' || text === 'finished') {
                info('检测到"已看完"文本标记');
                return true;
            }
        }

        // 方式3：检测进度条样式（width >= 95%）
        const progressBars = document.querySelectorAll(
            '.progress-bar, .progress-fill, [class*="progress"] [style*="width"]'
        );
        for (const bar of progressBars) {
            const style = bar.getAttribute('style') || '';
            const match = style.match(/width:\s*(\d+\.?\d*)%/);
            if (match && parseFloat(match[1]) >= 95) {
                info(`进度条 width=${match[1]}%，已看完`);
                return true;
            }
        }

        return false;
    }

    // ==================== 视频控制 ====================
    function getAllVideos() {
        return document.querySelectorAll('video');
    }

    function applyRateToAllVideos() {
        getAllVideos().forEach(video => {
            video.playbackRate = CONFIG.playbackRate;
            log('设置倍率:', CONFIG.playbackRate);
        });
    }

    function applyMuteToAllVideos() {
        getAllVideos().forEach(video => {
            video.muted = CONFIG.autoMute;
        });
    }

    // 恢复播放的冷却时间（毫秒），防止与平台暂停机制打架导致反复暂停/播放
    const RESUME_COOLDOWN = 3000;
    // 每个视频的最近一次恢复播放时间
    const lastResumeTime = new WeakMap();

    function canResume(video) {
        const last = lastResumeTime.get(video) || 0;
        return Date.now() - last >= RESUME_COOLDOWN;
    }

    // 标记用户手动暂停（点击视频播放器上的暂停按钮）
    function setupUserPauseDetection(video) {
        // 监听播放器容器上的点击事件，判断是否为用户主动暂停
        const container = video.closest('.video-container, .player, .video-wrapper, .video-player, [class*="video"], [class*="player"]') || video.parentElement;
        if (container && !container._ulClickSetup) {
            container._ulClickSetup = true;
            container.addEventListener('click', () => {
                // 用户点击了播放器区域，短暂延迟后检查状态
                setTimeout(() => {
                    if (video.paused) {
                        video._ulUserPaused = true;
                        info('检测到用户手动暂停');
                        updateStatus('⏸ 已暂停（用户操作，不会自动恢复）');
                        // 显示恢复按钮
                        const resumeBtn = document.querySelector('#ul-helper-resume');
                        if (resumeBtn) resumeBtn.style.display = 'block';
                    } else {
                        video._ulUserPaused = false;
                    }
                }, 200);
            }, true);
        }
    }

    function tryPlayVideo(video) {
        if (!video.paused || !CONFIG.autoPlay) return;
        if (!canResume(video)) {
            log('恢复播放冷却中，跳过');
            return;
        }

        lastResumeTime.set(video, Date.now());

        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                info('视频已自动播放');
                updateStatus('▶ 正在播放...');
            }).catch(err => {
                log('自动播放被阻止:', err);
                // 尝试静音后播放
                video.muted = true;
                video.play().then(() => {
                    info('静音自动播放成功');
                    updateStatus('▶ 静音播放中...');
                }).catch(e2 => {
                    log('静音播放也失败:', e2);
                    updateStatus('⚠ 播放失败，请手动点击');
                });
            });
        }
    }

    function setupVideo(video) {
        if (video._ulHelperSetup) return;
        video._ulHelperSetup = true;

        info('检测到视频元素，开始设置');

        // === 核心：拦截 pause()，阻止平台程序化暂停 ===
        const originalPause = video.pause.bind(video);
        video._ulOriginalPause = originalPause;

        video.pause = function () {
            // 如果开启了自动播放且视频没播放完，忽略外部的暂停调用
            if (CONFIG.autoPlay && !video.ended && !video._ulUserPaused) {
                log('拦截到外部 pause() 调用，已忽略');
                return;
            }
            originalPause();
        };

        // 设置倍率
        video.playbackRate = CONFIG.playbackRate;

        // 静音
        if (CONFIG.autoMute) {
            video.muted = true;
        }

        // 自动播放
        tryPlayVideo(video);

        // 检测用户手动暂停
        setupUserPauseDetection(video);

        // 监听倍率变化（防止页面重置倍率）
        video.addEventListener('ratechange', () => {
            if (video.playbackRate !== CONFIG.playbackRate) {
                log('倍率被重置，恢复为:', CONFIG.playbackRate);
                video.playbackRate = CONFIG.playbackRate;
            }
        });

        // 监听暂停事件（兜底：如果拦截 pause() 没生效，仍通过事件恢复）
        video.addEventListener('pause', () => {
            if (CONFIG.autoPlay && !video.ended && !video._ulUserPaused) {
                log('视频被暂停（事件），延迟恢复播放');
                setTimeout(() => {
                    if (video.paused && !video.ended && CONFIG.autoPlay && !video._ulUserPaused) {
                        tryPlayVideo(video);
                    }
                }, 2000);
            }
        });

        // 视频播放结束
        video.addEventListener('ended', () => {
            info('当前视频播放完毕');
            updateStatus('✅ 当前视频播放完毕');
            if (CONFIG.autoNext) {
                goToNextVideo();
            }
        });

        // 更新播放进度状态 + 卡顿检测
        video.addEventListener('timeupdate', () => {
            if (video.duration && isFinite(video.duration)) {
                const vp = getViewProgress();
                if (vp !== null) {
                    // viewProgress 是平台真实进度，以此推算当前时间
                    const realCurrentTime = (vp / 100) * video.duration;
                    updateStatus(`▶ 播放中 ${vp.toFixed(1)}% | ${formatTime(realCurrentTime)}/${formatTime(video.duration)} | ${video.playbackRate}x`);
                } else {
                    const progress = ((video.currentTime / video.duration) * 100).toFixed(1);
                    updateStatus(`▶ 播放中 ${progress}% | ${formatTime(video.currentTime)}/${formatTime(video.duration)} | ${video.playbackRate}x`);
                }
            }
            checkVideoStall(video);
        });

        info('视频设置完成，倍率:', CONFIG.playbackRate);
        updateStatus('▶ 已设置视频，播放中...');
    }

    function formatTime(seconds) {
        if (!isFinite(seconds)) return '--:--';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // ==================== 自动下一节 ====================
    const NEXT_COOLDOWN_MS = 8000;  // 跳转冷却 8 秒，防止重复触发
    let lastNextTime = 0;

    function goToNextVideo() {
        const now = Date.now();
        if (now - lastNextTime < NEXT_COOLDOWN_MS) {
            log(`跳转冷却中（${Math.ceil((NEXT_COOLDOWN_MS - (now - lastNextTime)) / 1000)}s），跳过`);
            return;
        }
        lastNextTime = now;
        info('尝试跳转下一节...');
        updateStatus('⏭ 跳转下一节...');

        // 策略1：精确匹配 ulearning 的"下一页"按钮（通过 nextPage 绑定定位）
        const nextSelectors = [
            'span[data-bind*="nextPage"]',
            'button[data-bind*="goNextPage"]',
            '.btn-hollow[data-bind*="goNextPage"]',
            '.next-btn',
            '.btn-next',
            '.ant-btn-next',
            '.el-button--next',
            '.course-next',
            '.section-next',
            '.chapter-next',
        ];

        for (const sel of nextSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el && el.offsetParent !== null) {
                    // 如果匹配到 span，点击其父级按钮容器
                    const btn = el.closest('button, .btn-tip, [role="button"], .btn') || el;
                    // 验证按钮文本不是"上一页""上一章"等
                    const text = btn.textContent.trim().toLowerCase();
                    if (text.includes('上一') || text.includes('prev') || text.includes('previous')) {
                        log('跳过"上一页"按钮:', text);
                        continue;
                    }
                    info('找到下一节按钮:', sel, '文本:', text);
                    btn.click();
                    updateStatus('⏭ 已点击: ' + text);
                    return;
                }
            } catch (e) {}
        }

        // 策略1.5：按文本内容查找"继续下一章""下一节""下一页"等按钮
        const allBtns = document.querySelectorAll('button, [role="button"], .btn-hollow, .btn, .btn-tip');
        const nextTexts = ['继续下一章', '下一章', '下一节', '下一页', '下一个', 'next'];
        const prevTexts = ['上一章', '上一节', '上一页', '上一个', 'prev', 'previous'];
        for (const btn of allBtns) {
            const text = btn.textContent.trim().toLowerCase();
            // 排除"上一页""上一章"等
            if (prevTexts.some(t => text.includes(t.toLowerCase()))) continue;
            if (nextTexts.some(t => text.includes(t.toLowerCase())) && !btn.disabled && btn.offsetParent !== null) {
                info('按文本找到下一节按钮:', btn.textContent.trim());
                btn.click();
                updateStatus('⏭ 已点击: ' + btn.textContent.trim());
                return;
            }
        }

        // 策略2：查找侧边栏课程目录，点击下一个未完成项
        const sidebarItems = document.querySelectorAll(
            '.course-item, .chapter-item, .section-item, .lesson-item, ' +
            '.catalog-item, .menu-item, [class*="course"][class*="item"], ' +
            '[class*="section"][class*="item"], [class*="chapter"][class*="item"], ' +
            '.ant-menu-item, .el-menu-item'
        );

        if (sidebarItems.length > 0) {
            for (let i = 0; i < sidebarItems.length; i++) {
                const item = sidebarItems[i];
                // 查找当前激活项
                if (item.classList.contains('active') || item.classList.contains('current') ||
                    item.classList.contains('selected') || item.getAttribute('aria-selected') === 'true') {
                    // 点击下一个
                    if (i + 1 < sidebarItems.length) {
                        info('从目录跳转下一节，索引:', i + 1);
                        sidebarItems[i + 1].click();
                        updateStatus('⏭ 从目录跳转下一节');
                        return;
                    }
                }
            }

            // 如果没有找到激活项，尝试点击第一个未完成的
            for (const item of sidebarItems) {
                const icon = item.querySelector('[class*="icon"], [class*="status"]');
                if (icon && !icon.className.includes('complete') && !icon.className.includes('done')) {
                    info('点击第一个未完成项');
                    item.click();
                    updateStatus('⏭ 点击未完成项');
                    return;
                }
            }
        }

        // 策略3：查找弹窗中的确认/继续按钮
        const modalButtons = document.querySelectorAll(
            '.modal button, .dialog button, .ant-modal button, .el-dialog button, ' +
            '[class*="modal"] button, [class*="dialog"] button'
        );
        for (const btn of modalButtons) {
            const text = btn.textContent.trim();
            if (text.includes('继续') || text.includes('下一') || text.includes('确定') || text.includes('完成')) {
                info('点击弹窗按钮:', text);
                btn.click();
                return;
            }
        }

        info('未找到下一节入口，可能已完成所有课程');
        updateStatus('📋 未找到下一节，可能已全部完成');
    }

    // ==================== jQuery AJAX 安全处理 ====================
    function patchjQueryAJAX() {
        // 拦截 jQuery 的 JSON 解析，防止空响应导致 SyntaxError
        const waitjQuery = setInterval(() => {
            if (window.$ && $.ajaxSettings) {
                clearInterval(waitjQuery);
                // 全局 AJAX 错误处理，静默吞掉 JSON 解析错误
                $(document).ajaxError(function (event, jqXHR, ajaxSettings, thrownError) {
                    if (thrownError === 'SyntaxError' || (thrownError && thrownError.message && thrownError.message.includes('JSON'))) {
                        log('已拦截 AJAX JSON 解析错误:', ajaxSettings.url);
                    }
                });
                // 备用：重写 dataFilter，对空响应返回空对象
                const origDataFilter = $.ajaxSettings.dataFilter;
                $.ajaxSettings.dataFilter = function (data, type) {
                    if (type === 'json' && (!data || !data.trim())) {
                        log('拦截到空 JSON 响应，替换为空对象');
                        return '{}';
                    }
                    if (origDataFilter) {
                        return origDataFilter.apply(this, arguments);
                    }
                    return data;
                };
                info('jQuery AJAX 安全补丁已安装');
            }
        }, 500);
        // 10秒后放弃等待
        setTimeout(() => clearInterval(waitjQuery), 10000);
    }

    // ==================== 弹窗/确认框处理 ====================
    // 记录已点击过的弹窗按钮，避免重复点击触发 AJAX
    const clickedPopups = new WeakSet();

    function dismissPopups() {
        // 只处理明确的弹窗容器内的按钮，不遍历全页面
        const modalContainers = document.querySelectorAll(
            '.modal, .dialog, .ant-modal, .el-dialog, ' +
            '[class*="modal"]:not([class*="modal-"]), [class*="dialog"]:not([class*="dialog-"]), ' +
            '[role="dialog"], [aria-modal="true"]'
        );

        modalContainers.forEach(container => {
            // 只有可见的弹窗才处理
            if (container.offsetParent === null) return;

            // 关闭弹窗的 X 按钮
            const closeButtons = container.querySelectorAll(
                '.close, .btn-close, .ant-modal-close, .el-dialog__close, ' +
                '[class*="close"][class*="btn"], [aria-label="Close"], [class*="close-btn"]'
            );
            closeButtons.forEach(btn => {
                if (btn.offsetParent !== null && !clickedPopups.has(btn)) {
                    clickedPopups.add(btn);
                    log('关闭弹窗');
                    btn.click();
                }
            });

            // 弹窗内的确认按钮（仅限弹窗内，避免误触页面其他按钮）
            const confirmTexts = ['继续观看', '我在', '仍在学习', '继续学习'];
            const buttons = container.querySelectorAll('button, [role="button"], .btn');
            buttons.forEach(btn => {
                const text = btn.textContent.trim();
                if (confirmTexts.some(t => text.includes(t)) && btn.offsetParent !== null && !clickedPopups.has(btn)) {
                    clickedPopups.add(btn);
                    log('点击弹窗确认按钮:', text);
                    btn.click();
                }
            });
        });
    }

    // ==================== 主循环 ====================
    let retryCount = 0;

    function mainLoop() {
        const videos = getAllVideos();

        if (videos.length === 0) {
            retryCount++;
            if (retryCount <= CONFIG.maxRetry) {
                log('未找到视频，重试中...', retryCount);
                updateStatus(`🔍 检测视频中... (${retryCount}/${CONFIG.maxRetry})`);
            } else {
                updateStatus('📋 当前页面无视频');
            }
        } else {
            retryCount = 0;
            videos.forEach(video => setupVideo(video));

            // 检测当前视频是否已看完，自动跳过
            if (CONFIG.autoNext && isCurrentVideoFinished()) {
                info('检测到当前视频已看完，自动跳转下一节');
                updateStatus('⏭ 已看完，跳转下一节...');
                goToNextVideo();
                return;
            }
        }

        // 处理弹窗
        dismissPopups();

        // 确保倍率正确 + 卡顿检测
        videos.forEach(video => {
            if (video.playbackRate !== CONFIG.playbackRate) {
                video.playbackRate = CONFIG.playbackRate;
            }
            // 确保没有暂停（带冷却，避免反复暂停/播放）
            if (video.paused && CONFIG.autoPlay && !video.ended && canResume(video)) {
                tryPlayVideo(video);
            }
            // 卡顿检测（mainLoop 兜底，不依赖 timeupdate）
            checkVideoStall(video);
        });
    }

    // ==================== MutationObserver 监听动态加载 ====================
    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeName === 'VIDEO') {
                        info('检测到新增视频元素');
                        setupVideo(node);
                    }
                    if (node.querySelectorAll) {
                        const videos = node.querySelectorAll('video');
                        if (videos.length > 0) {
                            videos.forEach(v => setupVideo(v));
                        }
                    }
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        log('DOM监听器已启动');
    }

    // ==================== 启动 ====================
    function init() {
        info('脚本启动，配置:', CONFIG);

        // 等待页面加载
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            start();
        } else {
            window.addEventListener('load', start);
        }
    }

    function start() {
        // 延迟启动，等待SPA渲染
        setTimeout(() => {
            createControlPanel();
            observeDOM();
            patchjQueryAJAX();

            // 立即检测一次
            mainLoop();

            // 定时检测
            setInterval(mainLoop, CONFIG.skipInterval);

            info('脚本已完全启动');
        }, 1500);
    }

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl+Shift+U 切换面板显示
        if (e.ctrlKey && e.shiftKey && e.key === 'U') {
            const panel = document.querySelector('#ul-helper-panel');
            if (panel) {
                panel.style.display = panel.style.display === 'none' ? '' : 'none';
            }
        }
    });

    init();
})();
