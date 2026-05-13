(function () {
    'use strict';

    // ─── State ───
    const state = {
        settings: loadSettings(),
        history: loadHistory(),
        generating: false,
        abortController: null,
        selectedStyle: '',
        selectedRatio: { ratio: '1:1', ratioW: 1, ratioH: 1, width: 1024, height: 1024 },
        outputSize: { token: '1k', multiplier: 1 },
        imageQuality: 'auto',
    };

    // ─── DOM Refs ───
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ─── Settings Persistence ───
    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem('aigc_settings')) || {
                apiProvider: 'custom',
                apiKey: '',
                customEndpoint: 'http://localhost:8787/v1/images/generations',
                customHeaders: '{"Authorization":"Bearer 你的key"}',
                customBodyTemplate: '{"model":"gpt-image-2","prompt":"{{prompt}}","size":"1024x1024"}',
            };
        } catch { return { apiProvider: 'custom', apiKey: '', customEndpoint: 'http://localhost:8787/v1/images/generations', customHeaders: '{"Authorization":"Bearer 你的key"}', customBodyTemplate: '{"model":"gpt-image-2","prompt":"{{prompt}}","size":"1024x1024"}' }; }
    }

    function saveSettings(s) {
        state.settings = s;
        localStorage.setItem('aigc_settings', JSON.stringify(s));
    }

    function loadHistory() {
        try { return JSON.parse(localStorage.getItem('aigc_history')) || []; }
        catch { return []; }
    }

    function saveHistory() {
        localStorage.setItem('aigc_history', JSON.stringify(state.history.slice(0, 200)));
    }

    // ─── Toast ───
    function toast(msg, type = 'info') {
        const container = $('#toastContainer');
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
    }

    // ─── Random Prompts ───
    const randomPrompts = [
        "A serene Japanese garden with cherry blossoms falling into a koi pond, soft morning light, watercolor style",
        "Cyberpunk samurai standing on a neon-lit rooftop in Neo Tokyo, rain, cinematic, ultra detailed",
        "A magical library floating in space, books orbiting like planets, surreal fantasy art, 8K",
        "Steampunk airship docking at a Victorian sky-city, golden hour, concept art",
        "An ancient dragon sleeping atop a mountain of gold coins in a massive cavern, dramatic lighting",
        "Underwater city made of coral and crystal, bioluminescent sea creatures, ethereal atmosphere",
        "A cozy cabin in a snowy forest at night, warm light from windows, northern lights above, photorealistic",
        "Robot artist painting a sunset on an alien planet with two suns, sci-fi, detailed",
        "Enchanted mushroom forest with tiny fairy houses, magical glowing particles, fantasy illustration",
        "A futuristic race car speeding through a neon tunnel, motion blur, cinematic angle, 4K",
        "Portrait of an elegant elf queen with silver hair, intricate crown, fantasy art, highly detailed",
        "A surreal dreamscape where clocks melt over floating islands, Salvador Dali inspired",
        "Giant tree of life in the center of a floating island, waterfalls, fantasy world, epic scale",
        "Vintage coffee shop in Paris, rainy afternoon, warm lighting, oil painting style",
        "Astronaut discovering an ancient alien temple on Mars, sci-fi concept art, dramatic lighting",
    ];

    // ─── Init ───
    function init() {
        bindEvents();
        applySettingsToUI();
        applyResolution();
        renderHistory();
    }

    function bindEvents() {
        // Settings modal
        $('#settingsBtn').addEventListener('click', () => openModal('settingsModal'));
        $('#closeSettings').addEventListener('click', () => closeModal('settingsModal'));
        $('#saveSettings').addEventListener('click', handleSaveSettings);
        $('#testApi').addEventListener('click', handleTestApi);
        $('#toggleApiKey').addEventListener('click', () => {
            const inp = $('#apiKey');
            inp.type = inp.type === 'password' ? 'text' : 'password';
        });
        $('#apiProvider').addEventListener('change', handleProviderChange);

        // History modal
        $('#historyBtn').addEventListener('click', () => { renderHistoryModal(); openModal('historyModal'); });
        $('#closeHistory').addEventListener('click', () => closeModal('historyModal'));
        $('#clearHistory').addEventListener('click', () => {
            if (confirm('确定清空所有历史记录？')) {
                state.history = [];
                saveHistory();
                renderHistoryModal();
                toast('历史记录已清空', 'success');
            }
        });

        // Preview modal
        $('#closePreview').addEventListener('click', () => closeModal('previewModal'));
        $('#downloadImage').addEventListener('click', handleDownload);
        $('#reusePrompt').addEventListener('click', handleReuse);

        // Model select
        $('#modelSelect').addEventListener('change', (e) => {
            const custom = $('#customModelName');
            custom.classList.toggle('hidden', e.target.value !== 'custom');
            updateVisibleParams();
        });

        // Ratio grid
        $$('.ratio-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.ratio-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const rw = parseInt(btn.dataset.w, 10);
                const rh = parseInt(btn.dataset.h, 10);
                state.selectedRatio = {
                    ratio: btn.dataset.ratio,
                    ratioW: rw,
                    ratioH: rh,
                    width: rw,
                    height: rh,
                };
                applyResolution();
                $('#ratioDisplay').textContent = state.selectedRatio.ratio;
            });
        });


        // Output size tabs
        $$('#outputSizeTabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#outputSizeTabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.outputSize = {
                    token: btn.dataset.sizeToken,
                    multiplier: parseInt(btn.dataset.multiplier, 10) || 1,
                };
                applyResolution();
            });
        });

        // Quality tabs
        $$('#qualityTabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#qualityTabs .tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.imageQuality = btn.dataset.quality || 'auto';
            });
        });

        // Sliders
        $('#batchSize').addEventListener('input', (e) => { $('#batchValue').textContent = e.target.value; });
        $('#steps').addEventListener('input', (e) => { $('#stepsValue').textContent = e.target.value; });
        $('#cfgScale').addEventListener('input', (e) => { $('#cfgValue').textContent = e.target.value; });

        // Seed
        $('#randomSeed').addEventListener('click', () => { $('#seed').value = -1; });

        // Style tags
        $$('.style-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                $$('.style-tag').forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
                state.selectedStyle = tag.dataset.style;
            });
        });

        // Prompt actions
        $('#clearPrompt').addEventListener('click', () => {
            $('#promptInput').value = '';
            $('#negativePrompt').value = '';
        });
        $('#randomPrompt').addEventListener('click', () => {
            const p = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
            $('#promptInput').value = p;
        });
        $('#toggleNegative').addEventListener('click', () => {
            const neg = $('#negativePrompt');
            const btn = $('#toggleNegative');
            neg.classList.toggle('collapsed');
            btn.textContent = neg.classList.contains('collapsed') ? '展开' : '收起';
        });
        $('#translateBtn').addEventListener('click', handleTranslate);

        // Generate
        $('#generateBtn').addEventListener('click', handleGenerate);
        $('#cancelGenerate').addEventListener('click', () => {
            if (state.abortController) state.abortController.abort();
            state.generating = false;
            $('#loadingOverlay').classList.remove('active');
        });

        // Quick prompts
        $$('.quick-prompt').forEach(el => {
            el.addEventListener('click', () => {
                $('#promptInput').value = el.dataset.prompt;
                handleGenerate();
            });
        });

        // Keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate();
            if (e.key === 'Escape') {
                closeModal('settingsModal');
                closeModal('historyModal');
                closeModal('previewModal');
            }
        });

        // Click overlay to close
        $$('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.classList.remove('active');
            });
        });
    }

    // ─── Settings UI ───
    function applySettingsToUI() {
        const s = state.settings;
        $('#apiProvider').value = s.apiProvider || 'stability';
        $('#apiKey').value = s.apiKey || '';
        $('#customEndpoint').value = s.customEndpoint || '';
        $('#customHeaders').value = s.customHeaders || '';
        $('#customBodyTemplate').value = s.customBodyTemplate || '';
        handleProviderChange();
    }

    function handleProviderChange() {
        const provider = $('#apiProvider').value;
        const isCustom = provider === 'custom';
        $('#customEndpointSection').style.display = isCustom ? '' : 'none';
        $('#customHeadersSection').style.display = isCustom ? '' : 'none';
        $('#customBodySection').style.display = isCustom ? '' : 'none';

        const helpMap = {
            stability: '前往 <a href="https://platform.stability.ai/account/keys" target="_blank">Stability AI</a> 获取 API Key',
            openai: '前往 <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI</a> 获取 API Key',
            replicate: '前往 <a href="https://replicate.com/account/api-tokens" target="_blank">Replicate</a> 获取 API Token',
            custom: '填写你的自定义 API 信息',
        };
        $('#apiHelp').innerHTML = helpMap[provider] || '';
        updateVisibleParams();
    }

    function updateVisibleParams() {
        const model = $('#modelSelect').value;
        const isDalle = model.startsWith('dall-e');
        $('#stepsSection').style.display = isDalle ? 'none' : '';
        $('#cfgSection').style.display = isDalle ? 'none' : '';
    }

    function handleSaveSettings() {
        const s = {
            apiProvider: $('#apiProvider').value,
            apiKey: $('#apiKey').value.trim(),
            customEndpoint: $('#customEndpoint').value.trim(),
            customHeaders: $('#customHeaders').value.trim(),
            customBodyTemplate: $('#customBodyTemplate').value.trim(),
        };
        if (!s.apiKey && s.apiProvider !== 'custom') {
            toast('请输入 API Key', 'error');
            return;
        }
        saveSettings(s);
        toast('设置已保存', 'success');
        closeModal('settingsModal');
    }

    async function handleTestApi() {
        const result = $('#testResult');
        result.className = 'test-result';
        result.style.display = 'none';

        const provider = $('#apiProvider').value;
        const apiKey = $('#apiKey').value.trim();

        if (!apiKey && provider !== 'custom') {
            result.className = 'test-result error';
            result.textContent = '请先输入 API Key';
            result.style.display = 'block';
            return;
        }

        try {
            let ok = false;
            if (provider === 'stability') {
                const res = await fetch('https://api.stability.ai/v1/user/account', {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                ok = res.ok;
                if (ok) {
                    const data = await res.json();
                    result.textContent = `连接成功! 账户邮箱: ${data.email || 'N/A'}, 余额: ${data.credits !== undefined ? data.credits.toFixed(2) : 'N/A'}`;
                } else {
                    result.textContent = `连接失败: HTTP ${res.status}`;
                }
            } else if (provider === 'openai') {
                const res = await fetch('https://api.openai.com/v1/models', {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                ok = res.ok;
                result.textContent = ok ? '连接成功! OpenAI API Key 有效' : `连接失败: HTTP ${res.status}`;
            } else if (provider === 'replicate') {
                const res = await fetch('https://api.replicate.com/v1/account', {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                ok = res.ok;
                result.textContent = ok ? '连接成功! Replicate Token 有效' : `连接失败: HTTP ${res.status}`;
            } else {
                result.textContent = '自定义 API 请直接尝试生成图片来测试';
                ok = true;
            }
            result.className = `test-result ${ok ? 'success' : 'error'}`;
            result.style.display = 'block';
        } catch (err) {
            result.className = 'test-result error';
            result.textContent = `连接错误: ${err.message}`;
            result.style.display = 'block';
        }
    }

    function applyResolution() {
        const { multiplier } = state.outputSize;
        const rw = state.selectedRatio.ratioW || 1;
        const rh = state.selectedRatio.ratioH || 1;
        const base = 1024;
        const scale = Math.sqrt((base * base) / (rw * rh));
        const rawWidth = Math.max(256, Math.round(rw * scale * multiplier));
        const rawHeight = Math.max(256, Math.round(rh * scale * multiplier));
        const width = Math.max(256, Math.round(rawWidth / 64) * 64);
        const height = Math.max(256, Math.round(rawHeight / 64) * 64);
        state.selectedRatio.width = width;
        state.selectedRatio.height = height;
        const display = $('#sizeDisplay');
        if (display) display.textContent = `${width} × ${height}`;
    }


    async function handleTranslate() {
        const prompt = $('#promptInput').value.trim();
        if (!prompt) { toast('请先输入提示词', 'error'); return; }
        if (/^[\x00-\x7F\s]*$/.test(prompt)) { toast('已经是英文了', 'info'); return; }

        toast('正在翻译...', 'info');
        const translated = simpleTranslateToEnglish(prompt);
        $('#promptInput').value = translated;
        toast('已翻译（简易翻译，建议手动调整）', 'success');
    }

    function simpleTranslateToEnglish(text) {
        const map = {
            '猫': 'cat', '狗': 'dog', '女孩': 'girl', '男孩': 'boy', '城市': 'city',
            '森林': 'forest', '大海': 'ocean', '山': 'mountain', '花': 'flower',
            '树': 'tree', '太阳': 'sun', '月亮': 'moon', '星星': 'stars',
            '龙': 'dragon', '魔法': 'magic', '机器人': 'robot', '宇宙': 'universe',
            '梦幻': 'dreamy', '美丽': 'beautiful', '壮观': 'magnificent',
            '可爱': 'cute', '帅气': 'handsome', '神秘': 'mysterious',
            '古老': 'ancient', '未来': 'futuristic', '中国': 'Chinese',
            '日本': 'Japanese', '风格': 'style', '高清': 'high definition',
            '超现实': 'surreal', '写实': 'realistic', '动漫': 'anime',
        };
        let result = text;
        for (const [zh, en] of Object.entries(map)) {
            result = result.replace(new RegExp(zh, 'g'), en);
        }
        return result;
    }

    // ─── Image Generation ───
    async function handleGenerate() {
        const prompt = $('#promptInput').value.trim();
        if (!prompt) { toast('请输入图片描述', 'error'); return; }

        const s = state.settings;
        if (!s.apiKey && s.apiProvider !== 'custom') {
            toast('请先在设置中配置 API Key', 'error');
            openModal('settingsModal');
            return;
        }

        if (state.generating) return;
        state.generating = true;
        state.abortController = new AbortController();

        const model = $('#modelSelect').value === 'custom'
            ? ($('#customModelName').value.trim() || 'custom-model')
            : $('#modelSelect').value;
        const negativePrompt = $('#negativePrompt').value.trim();
        const width = state.selectedRatio.width;
        const height = state.selectedRatio.height;
        const steps = parseInt($('#steps').value);
        const cfgScale = parseFloat($('#cfgScale').value);
        const seed = parseInt($('#seed').value);
        const batchSize = parseInt($('#batchSize').value);
        const style = state.selectedStyle;

        // Show loading
        $('#loadingOverlay').classList.add('active');
        $('#galleryEmpty').style.display = 'none';

        // Add generating placeholders
        const grid = $('#galleryGrid');
        const placeholders = [];
        for (let i = 0; i < batchSize; i++) {
            const ph = createGeneratingPlaceholder();
            grid.insertBefore(ph, grid.firstChild);
            placeholders.push(ph);
        }

        try {
            let styledPrompt = prompt;
            if (style) {
                const styleMap = {
                    'photographic': 'professional photograph, ',
                    'digital-art': 'digital art, ',
                    'anime': 'anime style, ',
                    'cinematic': 'cinematic shot, ',
                    '3d-model': '3D render, ',
                    'pixel-art': 'pixel art, ',
                    'watercolor': 'watercolor painting, ',
                    'oil-painting': 'oil painting, ',
                    'line-art': 'line art, ink drawing, ',
                };
                styledPrompt = (styleMap[style] || '') + prompt;
            }

            const params = {
                prompt: styledPrompt,
                negativePrompt,
                model,
                width,
                height,
                steps,
                cfgScale,
                seed: seed === -1 ? Math.floor(Math.random() * 2147483647) : seed,
                batchSize,
                quality: state.imageQuality,
                outputSize: state.outputSize.token,
                aspectRatio: state.selectedRatio.ratio,
            };

            const images = await callApi(params);

            placeholders.forEach(ph => ph.remove());

            images.forEach((imgData) => {
                const item = createGalleryItem(imgData, params);
                grid.insertBefore(item, grid.firstChild);

                state.history.unshift({
                    image: imgData,
                    params,
                    timestamp: Date.now(),
                });
            });

            saveHistory();
            toast(`成功生成 ${images.length} 张图片`, 'success');
        } catch (err) {
            placeholders.forEach(ph => ph.remove());
            if (err.name !== 'AbortError') {
                toast(`生成失败: ${err.message}`, 'error');
                console.error('Generation error:', err);
            }
            if (grid.children.length === 0) {
                $('#galleryEmpty').style.display = '';
            }
        } finally {
            state.generating = false;
            state.abortController = null;
            $('#loadingOverlay').classList.remove('active');
        }
    }

    async function callApi(params) {
        const s = state.settings;
        const signal = state.abortController.signal;

        switch (s.apiProvider) {
            case 'stability': return callStabilityApi(params, s.apiKey, signal);
            case 'openai': return callOpenAIApi(params, s.apiKey, signal);
            case 'replicate': return callReplicateApi(params, s.apiKey, signal);
            case 'custom': return callCustomApi(params, s, signal);
            default: throw new Error('未知的 API 提供商');
        }
    }

    // ─── Stability AI ───
    async function callStabilityApi(params, apiKey, signal) {
        const model = params.model;
        const images = [];

        // Different endpoints for different model families
        if (model.startsWith('sd3') || model.startsWith('flux')) {
            // SD3 / FLUX uses the new v2beta endpoint
            for (let i = 0; i < params.batchSize; i++) {
                const formData = new FormData();
                formData.append('prompt', params.prompt);
                if (params.negativePrompt) formData.append('negative_prompt', params.negativePrompt);
                formData.append('output_format', 'png');
                if (model.startsWith('sd3')) {
                    formData.append('model', params.model);
                }
                formData.append('aspect_ratio', mapAspectRatio(params.width, params.height));
                if (params.seed > 0) formData.append('seed', params.seed + i);

                const endpoint = model.startsWith('flux')
                    ? `https://api.stability.ai/v2beta/stable-image/generate/flux`
                    : `https://api.stability.ai/v2beta/stable-image/generate/sd3`;

                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        Accept: 'image/*',
                    },
                    body: formData,
                    signal,
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.message || errData.name || `API 错误 ${res.status}`);
                }

                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                images.push(url);
            }
        } else {
            // SDXL uses v1 endpoint
            const body = {
                text_prompts: [
                    { text: params.prompt, weight: 1 },
                ],
                cfg_scale: params.cfgScale,
                width: params.width,
                height: params.height,
                steps: params.steps,
                samples: params.batchSize,
            };
            if (params.negativePrompt) {
                body.text_prompts.push({ text: params.negativePrompt, weight: -1 });
            }
            if (params.seed > 0) body.seed = params.seed;

            const res = await fetch(`https://api.stability.ai/v1/generation/${params.model}/text-to-image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || `API 错误 ${res.status}`);
            }

            const data = await res.json();
            for (const artifact of data.artifacts) {
                const blob = base64ToBlob(artifact.base64, 'image/png');
                images.push(URL.createObjectURL(blob));
            }
        }

        return images;
    }

    function mapAspectRatio(w, h) {
        const ratio = w / h;
        if (Math.abs(ratio - 1) < 0.05) return '1:1';
        if (Math.abs(ratio - 16 / 9) < 0.1) return '16:9';
        if (Math.abs(ratio - 9 / 16) < 0.1) return '9:16';
        if (Math.abs(ratio - 4 / 3) < 0.1) return '4:3';
        if (Math.abs(ratio - 3 / 4) < 0.1) return '3:4';
        if (Math.abs(ratio - 21 / 9) < 0.1) return '21:9';
        return '1:1';
    }

    // ─── OpenAI ───
    async function callOpenAIApi(params, apiKey, signal) {
        const sizeMap = {
            '1:1': '1024x1024',
            '16:9': '1792x1024',
            '9:16': '1024x1792',
        };
        const size = sizeMap[findClosestRatio(params.width, params.height)] || '1024x1024';

        const body = {
            model: params.model || 'dall-e-3',
            prompt: params.prompt,
            n: Math.min(params.batchSize, params.model === 'dall-e-3' ? 1 : 4),
            size,
            quality: params.quality === 'auto' ? 'high' : params.quality,
            response_format: 'b64_json',
        };

        const images = [];
        const iterations = params.model === 'dall-e-3' ? params.batchSize : 1;

        for (let i = 0; i < iterations; i++) {
            const res = await fetch('https://api.openai.com/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
                signal,
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error?.message || `API 错误 ${res.status}`);
            }

            const data = await res.json();
            for (const item of data.data) {
                if (item.b64_json) {
                    const blob = base64ToBlob(item.b64_json, 'image/png');
                    images.push(URL.createObjectURL(blob));
                } else if (item.url) {
                    images.push(item.url);
                }
            }
        }

        return images;
    }

    function findClosestRatio(w, h) {
        const ratio = w / h;
        if (Math.abs(ratio - 1) < 0.2) return '1:1';
        if (ratio > 1.3) return '16:9';
        return '9:16';
    }

    // ─── Replicate ───
    async function callReplicateApi(params, apiKey, signal) {
        const res = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'black-forest-labs/flux-1.1-pro',
                input: {
                    prompt: params.prompt,
                    width: params.width,
                    height: params.height,
                    num_outputs: params.batchSize,
                    ...(params.seed > 0 ? { seed: params.seed } : {}),
                },
            }),
            signal,
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || `API 错误 ${res.status}`);
        }

        const prediction = await res.json();
        let result = prediction;

        // Poll for completion
        while (result.status !== 'succeeded' && result.status !== 'failed') {
            await new Promise(r => setTimeout(r, 2000));
            const pollRes = await fetch(result.urls.get, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal,
            });
            result = await pollRes.json();
        }

        if (result.status === 'failed') throw new Error(result.error || '生成失败');

        const output = Array.isArray(result.output) ? result.output : [result.output];
        return output.filter(Boolean);
    }

    // ─── Custom API ───
    async function callCustomApi(params, settings, signal) {
        const endpoint = settings.customEndpoint;
        if (!endpoint) throw new Error('请先设置自定义 API 端点');

        let headers = { 'Content-Type': 'application/json' };
        if (settings.customHeaders) {
            try { headers = { ...headers, ...JSON.parse(settings.customHeaders) }; }
            catch { throw new Error('自定义请求头 JSON 格式错误'); }
        }

        let body;
        if (settings.customBodyTemplate) {
            let tmpl = settings.customBodyTemplate;
            tmpl = tmpl.replace(/\{\{prompt\}\}/g, params.prompt.replace(/"/g, '\\"'));
            tmpl = tmpl.replace(/\{\{negative_prompt\}\}/g, (params.negativePrompt || '').replace(/"/g, '\\"'));
            tmpl = tmpl.replace(/\{\{width\}\}/g, params.width);
            tmpl = tmpl.replace(/\{\{height\}\}/g, params.height);
            tmpl = tmpl.replace(/\{\{steps\}\}/g, params.steps);
            tmpl = tmpl.replace(/\{\{cfg_scale\}\}/g, params.cfgScale);
            tmpl = tmpl.replace(/\{\{seed\}\}/g, params.seed);
            tmpl = tmpl.replace(/\{\{model\}\}/g, params.model);
            tmpl = tmpl.replace(/\{\{batch_size\}\}/g, params.batchSize);
            tmpl = tmpl.replace(/\{\{quality\}\}/g, params.quality || 'auto');
            tmpl = tmpl.replace(/\{\{output_size\}\}/g, params.outputSize || '1k');
            tmpl = tmpl.replace(/\{\{aspect_ratio\}\}/g, params.aspectRatio || '1:1');
            try { body = JSON.parse(tmpl); }
            catch { throw new Error('请求体模板解析失败，请检查 JSON 格式'); }
        } else {
            body = {
                prompt: params.prompt,
                negative_prompt: params.negativePrompt,
                width: params.width,
                height: params.height,
                steps: params.steps,
                cfg_scale: params.cfgScale,
                seed: params.seed,
                model: params.model,
                batch_size: params.batchSize,
                quality: params.quality,
                output_size: params.outputSize,
                aspect_ratio: params.aspectRatio,
            };
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`API 错误 ${res.status}: ${text.slice(0, 200)}`);
        }

        const contentType = res.headers.get('content-type') || '';

        // If response is an image directly
        if (contentType.startsWith('image/')) {
            const blob = await res.blob();
            return [URL.createObjectURL(blob)];
        }

        // JSON response - try to extract images
        const data = await res.json();
        return extractImagesFromResponse(data);
    }

    function extractImagesFromResponse(data) {
        const images = [];

        function findImages(obj) {
            if (!obj) return;
            if (typeof obj === 'string') {
                if (obj.startsWith('data:image') || obj.startsWith('http')) {
                    images.push(obj);
                } else if (obj.length > 100 && /^[A-Za-z0-9+/=]+$/.test(obj.replace(/\s/g, ''))) {
                    const blob = base64ToBlob(obj, 'image/png');
                    images.push(URL.createObjectURL(blob));
                }
                return;
            }
            if (Array.isArray(obj)) {
                obj.forEach(findImages);
                return;
            }
            if (typeof obj === 'object') {
                const imgKeys = ['image', 'images', 'url', 'urls', 'output', 'data', 'result', 'results', 'b64_json', 'base64', 'artifacts'];
                for (const key of imgKeys) {
                    if (obj[key]) findImages(obj[key]);
                }
                if (images.length === 0) {
                    for (const val of Object.values(obj)) findImages(val);
                }
            }
        }

        findImages(data);
        return images;
    }

    // ─── Helpers ───
    function base64ToBlob(b64, mime) {
        const bytes = atob(b64);
        const arr = new Uint8Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    function createGeneratingPlaceholder() {
        const div = document.createElement('div');
        div.className = 'gallery-item generating';
        div.innerHTML = `<div class="generating-content"><div class="generating-spinner"></div><p>生成中...</p></div>`;
        return div;
    }

    function createGalleryItem(imgSrc, params) {
        const div = document.createElement('div');
        div.className = 'gallery-item';

        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = params.prompt.slice(0, 50);
        img.loading = 'lazy';
        div.appendChild(img);

        const overlay = document.createElement('div');
        overlay.className = 'gallery-item-overlay';
        overlay.innerHTML = `
            <div class="gallery-item-prompt">${escapeHtml(params.prompt)}</div>
            <div class="gallery-item-meta">
                <span>${params.model}</span>
                <span>${params.width}×${params.height}</span>
            </div>
        `;
        div.appendChild(overlay);

        div.addEventListener('click', () => {
            $('#previewImage').src = imgSrc;
            $('#previewInfo').textContent = params.prompt;
            $('#previewModal').dataset.imgSrc = imgSrc;
            $('#previewModal').dataset.prompt = params.prompt;
            openModal('previewModal');
        });

        return div;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Preview Actions ───
    function handleDownload() {
        const imgSrc = $('#previewModal').dataset.imgSrc;
        if (!imgSrc) return;
        const a = document.createElement('a');
        a.href = imgSrc;
        a.download = `aigc_${Date.now()}.png`;
        a.click();
    }

    function handleReuse() {
        const prompt = $('#previewModal').dataset.prompt;
        if (prompt) {
            $('#promptInput').value = prompt;
            closeModal('previewModal');
            toast('已复用提示词', 'success');
        }
    }

    // ─── History ───
    function renderHistory() {
        // Gallery page doesn't show history by default
    }

    function renderHistoryModal() {
        const grid = $('#historyGrid');
        if (state.history.length === 0) {
            grid.innerHTML = '<div class="gallery-empty"><p>暂无历史记录</p></div>';
            return;
        }

        grid.innerHTML = '';
        state.history.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'history-item';
            const img = document.createElement('img');
            img.src = item.image;
            img.alt = 'History';
            img.loading = 'lazy';
            div.appendChild(img);

            div.addEventListener('click', () => {
                $('#previewImage').src = item.image;
                $('#previewInfo').textContent = item.params.prompt;
                $('#previewModal').dataset.imgSrc = item.image;
                $('#previewModal').dataset.prompt = item.params.prompt;
                closeModal('historyModal');
                openModal('previewModal');
            });

            grid.appendChild(div);
        });
    }

    // ─── Modal Helpers ───
    function openModal(id) {
        $(`#${id}`).classList.add('active');
    }

    function closeModal(id) {
        $(`#${id}`).classList.remove('active');
    }

    // ─── Boot ───
    document.addEventListener('DOMContentLoaded', init);
})();
