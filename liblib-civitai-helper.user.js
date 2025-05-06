// ==UserScript==
// @name         liblib-civitai-helper 
// @namespace    http://tampermonkey.net/
// @version      1.4.2
// @description  liblib|civitai助手，支持自动保存到目录（Chromium），或自动批量下载（Firefox/Safari等），封面图片和json同名，兼容新版Civitai接口和页面
// @match        https://www.liblib.ai/modelinfo/*
// @match        https://www.liblib.art/modelinfo/*
// @match        http://www.liblib.ai/modelinfo/*
// @match        http://www.liblib.art/modelinfo/*
// @match        https://civitai.com/models/*
// @match        http://civitai.com/models/*
// @updateURL    https://raw.githubusercontent.com/Runarry/liblib-civitai-helper/refs/heads/main/liblib-civitai-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/Runarry/liblib-civitai-helper/refs/heads/main/liblib-civitai-helper.user.js
// @grant        GM_download
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    function htmlToText(html) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        let text = '';
        for (let i = 0; i < tempDiv.childNodes.length; i++) {
            if (tempDiv.childNodes[i].nodeName === 'P') {
                text += tempDiv.childNodes[i].textContent + '\n';
            }
        }
        return text;
    }

    function isChromiumFSAPISupported() {
        return typeof window.showDirectoryPicker === "function";
    }

    // --------- liblib功能部分 -----------
    async function saveLibLibAuthImagesInfo() {
        let modelType = 1;
        const div = document.querySelector('.ant-tabs-tab.ant-tabs-tab-active');
        const modelVersionId = parseInt(div.getAttribute('data-node-key'));
        const modelVer = div.innerText.replace(/[/\\?%*:|"<>]/g, '-');

        const allElements = document.querySelectorAll('div');
        let textDesc = '';
        allElements.forEach(function (element) {
            const classNames = element.className.split(/\s+/);
            for (let i = 0; i < classNames.length; i++) {
                if (classNames[i].startsWith('ModelDescription_desc')) {
                    textDesc = htmlToText(element.innerHTML);
                    textDesc = textDesc.replace(/\\n/g, '\n');
                    break;
                }
            }
        });
        if (!textDesc) return;

        const scriptContent = document.getElementById('__NEXT_DATA__').textContent;
        const scriptJson = JSON.parse(scriptContent);
        const uuid = scriptJson.query.uuid;
        const buildId = scriptJson.buildId;
        const webid = scriptJson.props.webid;
        const url_acceptor = "https://www.liblib.art/api/www/log/acceptor/f?timestamp=" + Date.now();
        const url_model = "https://www.liblib.art/api/www/model/getByUuid/" + uuid + "?timestamp=" + Date.now();

        await fetch(url_acceptor, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({timestamp: Date.now()})
        });
        const resp = await fetch(url_model, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({timestamp: Date.now()})
        });
        const model_data = await resp.json();
        if (model_data.code !== 0) return;
        const modelId = model_data.data.id;
        const modelName = model_data.data.name.replace(/[/\\?%*:|"<>]/g, '-');
        let model_name_ver = modelName + "_" + modelVer;
        if (model_name_ver.slice(-1) === '.') {
            model_name_ver = model_name_ver.substring(0, model_name_ver.length - 1);
        }
        modelType = model_data.data.modelType;
        let modelTypeName = '未分类';
        switch (modelType) {
            case 1: modelTypeName = 'CheckPoint'; break;
            case 2: modelTypeName = 'embedding'; break;
            case 3: modelTypeName = 'HYPERNETWORK'; break;
            case 4: modelTypeName = 'AESTHETIC GRADIENT'; break;
            case 5: modelTypeName = 'Lora'; break;
            case 6: modelTypeName = 'LyCORIS'; break;
            case 9: modelTypeName = 'WILDCARDS'; break;
        }
        const versions = model_data.data.versions;
        for (const verItem of versions) {
            if (verItem.id === modelVersionId) {
                const promptList = [];
                const authImages = verItem.imageGroup.images;
                let isCover = false;
                let coverExt = '';
                let coverFileName = '';
                let coverImageUrl = '';
                for (const authImage of authImages) {
                    const authImageUrl = authImage.imageUrl;
                    var authimageExt = authImageUrl.split("/").pop().split(".").pop();
                    var tmp = authimageExt.indexOf("?");
                    if (tmp > 0) authimageExt = authimageExt.substring(0, tmp);
                    const generateInfo = authImage.generateInfo;
                    let generateText = "";
                    if (generateInfo) {
                        const fields = [
                            "prompt", "negativePrompt", "promptCn", "originalModelName", "metainformation", "negativePromptCn",
                            "samplingMethod", "samplingStep", "cfgScale", "seed", "pngInfo", "createBy", "createTime",
                            "updateBy", "updateTime", "deleteFlag", "modelNames", "generateId", "outputId", "models",
                            "v2Models", "v2MixModels", "generateInfo", "contentId", "controlNet", "recurrentEnabled",
                            "imageSource", "createByTeam"
                        ];
                        for (const key of fields) {
                            if (generateInfo[key] !== undefined && generateInfo[key] !== null) {
                                // 对象或数组用JSON.stringify
                                let value = generateInfo[key];
                                if (typeof value === "object") {
                                    try {
                                        value = JSON.stringify(value);
                                    } catch (e) {
                                        value = String(value);
                                    }
                                }
                                generateText += `${key}: ${value}\n`;
                            }
                        }
                    }
                    promptList.push(generateText);

                    if (!isCover) {
                        isCover = true;
                        coverExt = authimageExt;
                        coverFileName = model_name_ver + "." + authimageExt;
                        coverImageUrl = authImageUrl;
                    }
                }
                let basic = "";
                try {
                    const labels = document.querySelectorAll('.ModelDetailCard_label__PmKU_');
                    labels.forEach(label => {
                        if (label.textContent.trim() === '基础算法') {
                            const valueDiv = label.nextElementSibling;
                            if (valueDiv) basic = valueDiv.textContent.trim();
                        }
                    });
                } catch (e) {}
                let triggerWord = '触发词：';
                if ('triggerWord' in verItem && verItem.triggerWord) {
                    triggerWord = triggerWord + verItem.triggerWord;
                } else {
                    triggerWord = triggerWord + "无";
                }
                const jsonFileName = coverFileName.replace(/\.[^/.]+$/, ".json");
                // examplePrompt 放最后

                let modelInfoJson = {
                    modelType: modelTypeName,
                    description: textDesc,
                    uuid: uuid,
                    buildId: buildId,
                    webid: webid,
                    from: "Liblib",
                    fromUrl: window.location.href,
                    triggerWord: triggerWord,
                    basic: basic,
                    examplePrompt: promptList
                };

                let allTags = model_data.data.customTags || [];
                // 新增提取tagsV2中的所有tagLabel
                try {
                    const tagsV2 = scriptJson.props.pageProps.modelInfo.tagsV2;
                    if (tagsV2) {
                        for (const key in tagsV2) {
                            if (Array.isArray(tagsV2[key])) {
                                allTags = allTags.concat(tagsV2[key].map(tag => tag.tagLabel));
                            }
                        }
                    }
                    modelInfoJson.tags = allTags;
                } catch (e) {
                    console.warn("提取tagsV2失败", e);
                }

                if (isChromiumFSAPISupported()) {
                    const dirHandle = await window.showDirectoryPicker({mode: "readwrite"});
                    // 下载图片
                    if (coverImageUrl) {
                        const resp_download = await fetch(coverImageUrl);
                        const blob = await resp_download.blob();
                        const picHandle = await dirHandle.getFileHandle(coverFileName, {create: true});
                        const writable = await picHandle.createWritable();
                        await writable.write(blob);
                        await writable.close();
                    }
                    // 保存json
                    const savejsonHandle = await dirHandle.getFileHandle(jsonFileName, {create: true});
                    const writablejson = await savejsonHandle.createWritable();
                    await writablejson.write(JSON.stringify(modelInfoJson, null, 4));
                    await writablejson.close();
                } else {
                    if (coverImageUrl) {
                        GM_download({
                            url: coverImageUrl,
                            name: coverFileName
                        });
                    }
                    const jsonBlob = new Blob([JSON.stringify(modelInfoJson, null, 4)], {type: "application/json"});
                    const url = URL.createObjectURL(jsonBlob);
                    GM_download({
                        url: url,
                        name: jsonFileName,
                        onload: () => URL.revokeObjectURL(url)
                    });
                }
                alert("封面信息下载完成");
            }
        }
    }

    // --------- Civitai功能部分 -----------
    function getModelInfoFromURL() {
        const url = new URL(window.location.href);
        const pathParts = url.pathname.split('/');
        let modelId = null, modelVersionId = null;
        if (pathParts[1] === "models" && pathParts[2]) {
            modelId = pathParts[2];
        }
        if (url.searchParams.has('modelVersionId')) {
            modelVersionId = url.searchParams.get('modelVersionId');
        }
        return { modelId, modelVersionId };
    }

    async function saveCivitaiModelInfo() {
        const { modelId, modelVersionId } = getModelInfoFromURL();
        if (!modelId || !modelVersionId) {
            alert("未找到模型ID信息，请确认当前页面为模型详情页。");
            return;
        }
        const url_model = `https://civitai.com/api/v1/models/${modelId}`;
        let model_data;
        try {
            const resp = await fetch(url_model, { method: 'GET' });
            if (!resp.ok) {
                alert(`获取模型信息失败，HTTP状态码: ${resp.status}`);
                return;
            }
            model_data = await resp.json();
        } catch (e) {
            alert("获取模型信息失败: " + e);
            return;
        }
        const versions = model_data.modelVersions || [];
        const version = versions.find(v => String(v.id) === String(modelVersionId));
        if (!version) {
            alert("未找到对应的模型版本信息。");
            return;
        }
        const modelName = (model_data.name || "unknown_model").replace(/[/\\?%*:|"<>]/g, '-');
        const modelVer = (version.name || "v").replace(/[/\\?%*:|"<>]/g, '-');
        let model_name_ver = modelName + "_" + modelVer;
        if (model_name_ver.slice(-1) === '.') model_name_ver = model_name_ver.substring(0, model_name_ver.length - 1);

        const modelType = model_data.type || model_data.modelType || "未分类";
        const modelDesc = (version.description || "") + "\n\n" + (model_data.description || "");

        const triggerWords = Array.isArray(version.trainedWords) && version.trainedWords.length > 0
            ? "触发词：" + version.trainedWords.join("、")
            : "触发词：无";

        // 新增提取Civitai页面的模型tag信息
        function extractCivitaiTags() {
            const tagElements = document.querySelectorAll('a.mantine-Badge-root');
            const tags = [];
            tagElements.forEach(el => {
                const span = el.querySelector('span.mantine-Badge-inner');
                const tagText = span ? span.textContent.trim() : '';
                if (tagText) tags.push(tagText);
            });
            return tags;
        }

        let promptList = [];
        if (Array.isArray(version.images)) {
            promptList = version.images
                .filter(img => img.meta && img.meta.prompt)
                .map(img => img.meta.prompt);
        }
        let coverImageUrl = null;
        let coverExt = '';
        let coverFileName = '';
        if (Array.isArray(version.images) && version.images.length > 0) {
            const coverImgObj = version.images.find(img => img.type === 'image') || version.images[0];
            coverImageUrl = coverImgObj.url;
            if (coverImageUrl) {
                coverExt = coverImageUrl.split('.').pop().split('?')[0];
                coverFileName = model_name_ver + "." + coverExt;
            }
        }
        const jsonFileName = coverFileName ? coverFileName.replace(/\.[^/.]+$/, ".json") : (model_name_ver + ".json");
        let basic = "";
        if (version.baseModel) {
            basic = version.baseModel;
        } else if (model_data.baseModel) {
            basic = model_data.baseModel;
        }
        // examplePrompt 放最后
        const modelInfo = {
            modelType,
            description: modelDesc,
            modelName,
            modelVer,
            modelId,
            modelFile: (version.files && version.files[0]?.name) || "",
            modelVersionId,
            triggerWords,
            from: "Civitai",
            fromUrl: window.location.href,
            basic: basic,
            examplePrompt: promptList,
            tags: extractCivitaiTags()
        };

        if (isChromiumFSAPISupported()) {
            const dirHandle = await window.showDirectoryPicker({mode: "readwrite"});
            if (coverImageUrl) {
                const resp = await fetch(coverImageUrl);
                const blob = await resp.blob();
                const picHandle = await dirHandle.getFileHandle(coverFileName, {create: true});
                const writable = await picHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            }
            const savejsonHandle = await dirHandle.getFileHandle(jsonFileName, {create: true});
            const writablejson = await savejsonHandle.createWritable();
            await writablejson.write(JSON.stringify(modelInfo, null, 4));
            await writablejson.close();
        } else {
            if (coverImageUrl) {
                GM_download({
                    url: coverImageUrl,
                    name: coverFileName
                });
            }
            const jsonBlob = new Blob([JSON.stringify(modelInfo, null, 4)], {type: "application/json"});
            const url = URL.createObjectURL(jsonBlob);
            GM_download({
                url: url,
                name: jsonFileName,
                onload: () => URL.revokeObjectURL(url)
            });
        }
        alert("封面信息下载完成");
    }

    // MutationObserver 相关变量
    let modelActionCardObserver = null;
    let hasInsertedBtn = false;

    function insertLiblibButton(site) {
        if (document.getElementById('model-helper-btn')) return;
        const div1 = document.createElement('div');
        div1.style.display = 'flex';
        div1.style.justifyContent = "space-between";
        div1.style.alignItems = "center";
        div1.id = 'model-helper-btn';
        if (site === 'liblib') {
            const button1 = document.createElement('button');
            button1.textContent = '下载封面+生成信息';
            button1.onclick = saveLibLibAuthImagesInfo;
            button1.style.padding = '15px';
            button1.style.width = "200px";
            button1.style.backgroundColor = 'red';
            button1.style.color = 'white';
            button1.style.display = 'block';
            button1.style.flex = "1";
            button1.style.borderRadius = '8px';
            div1.appendChild(button1);
            const actionCard = document.querySelector('[class^="ModelActionCard_modelActionCard"]');
            if (actionCard) {
                actionCard.parentNode.insertBefore(div1, actionCard);
            } else {
                document.body.appendChild(div1);
            }
        } else if (site === 'civitai') {
            const button2 = document.createElement('button');
            button2.textContent = '下载封面+生成信息 (Civitai)';
            button2.onclick = saveCivitaiModelInfo;
            button2.style.padding = '15px';
            button2.style.width = "100%";
            button2.style.setProperty('background-color', 'blue', 'important');
            button2.style.color = 'white';
            button2.style.display = 'block';
            button2.style.flex = "1";
            button2.style.borderRadius = '4px';
            button2.style.marginBottom = '5px';
            div1.appendChild(button2);
            const gridRoot = document.querySelector('.mantine-ContainerGrid-root');
            if (gridRoot && gridRoot.children.length > 0) {
                const firstChild = gridRoot.children[0];
                if (firstChild) {
                    firstChild.insertBefore(div1, firstChild.firstChild);
                    div1.style.display = 'block';
                } else {
                    document.body.appendChild(div1);
                }
            } else {
                document.body.appendChild(div1);
            }
        }
        hasInsertedBtn = true;
    }

    function observeModelActionCard(site) {
        // 先移除旧 observer
        if (modelActionCardObserver) {
            modelActionCardObserver.disconnect();
            modelActionCardObserver = null;
        }
        hasInsertedBtn = false;
        // 如果按钮已存在，先移除
        const oldBtn = document.getElementById('model-helper-btn');
        if (oldBtn) oldBtn.remove();

        // 立即检查一次
        const actionCard = document.querySelector('[class^="ModelActionCard_modelActionCard"]');
        if (actionCard && !hasInsertedBtn) {
            insertLiblibButton(site);
            return; // 已插入，无需继续监听
        }

        // 启动 observer
        modelActionCardObserver = new MutationObserver((mutationsList, observer) => {
            if (hasInsertedBtn) return;
            const actionCard = document.querySelector('[class^="ModelActionCard_modelActionCard"]');
            if (actionCard) {
                insertLiblibButton(site);
                if (modelActionCardObserver) {
                    modelActionCardObserver.disconnect();
                    modelActionCardObserver = null;
                }
            }
        });
        modelActionCardObserver.observe(document.body, { childList: true, subtree: true });
    }

    function observeUrlChange(site) {
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    // 移除按钮和断开 observer，并重新监听
                    if (document.getElementById('model-helper-btn')) {
                        document.getElementById('model-helper-btn').remove();
                    }
                    if (modelActionCardObserver) {
                        modelActionCardObserver.disconnect();
                        modelActionCardObserver = null;
                    }
                    observeModelActionCard(site);
                }, 1000);
            }
        }, 1000);
    }

    (function () {
        const site = window.location.hostname.includes('liblib') ? 'liblib'
                  : window.location.hostname.includes('civitai') ? 'civitai'
                  : 'unknown';
        setTimeout(() => observeModelActionCard(site), 1000);
        observeUrlChange(site);
    })();

})();