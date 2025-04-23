// ==UserScript==
// @name         liblib|civitai助手-封面+模型信息（图片外置目录结构）
// @namespace    http://tampermonkey.net/
// @version      1.3.1
// @description  liblib|civitai助手，下载封面+模型信息，封面图片在目录外层，其他文件在子目录，兼容新版Civitai接口和页面
// @author       kaiery & ChatGPT
// @match        https://www.liblib.ai/modelinfo/*
// @match        https://www.liblib.art/modelinfo/*
// @match        https://civitai.com/models/*
// @match        http://civitai.com/models/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // --------- 工具函数 -----------
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

    // --------- liblib功能部分 -----------
    async function saveLibLibAuthImagesInfo() {
        let modelType = 1;
        const dirHandle = await window.showDirectoryPicker({mode: "readwrite"});
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
        if (textDesc) {
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
                    let modelInfoJson = {
                        modelType: modelTypeName,
                        description: textDesc,
                        uuid: uuid,
                        buildId: buildId,
                        webid: webid,
                        from: "Liblib",
                        fromUrl: window.location.href
                    };
                    const promptList = [];
                    // 图片信息start
                    const authImages = verItem.imageGroup.images;
                    let isCover = false;
                    let coverExt = '';
                    for (const authImage of authImages) {
                        const authImageUrl = authImage.imageUrl;
                        var authimageExt = authImageUrl.split("/").pop().split(".").pop();
                        var tmp = authimageExt.indexOf("?");
                        if (tmp > 0) authimageExt = authimageExt.substring(0, tmp);
                        const generateInfo = authImage.generateInfo;
                        if (generateInfo && generateInfo.prompt) promptList.push(generateInfo.prompt);
                        if (!isCover) {
                            isCover = true;
                            coverExt = authimageExt;
                            // 下载图片（外层）
                            const resp_download = await fetch(authImageUrl);
                            const blob = await resp_download.blob();
                            const fileName = model_name_ver + "." + authimageExt;
                            const picHandle = await dirHandle.getFileHandle(fileName, {create: true});
                            const writable = await picHandle.createWritable();
                            await writable.write(blob);
                            await writable.close();
                        }
                    }
                    // 图片信息end
                    let triggerWord = '触发词：';
                    if ('triggerWord' in verItem && verItem.triggerWord) {
                        triggerWord = triggerWord + verItem.triggerWord;
                    } else {
                        triggerWord = triggerWord + "无";
                    }
                    modelInfoJson.triggerWord = triggerWord;
                    // 创建模型目录( 模型+版本名 )
                    const modelDirHandle = await dirHandle.getDirectoryHandle(model_name_ver, {create: true});
                    const savejsonHandle = await modelDirHandle.getFileHandle(modelName + ".json", {create: true});
                    const writablejson = await savejsonHandle.createWritable();
                    await writablejson.write(JSON.stringify(modelInfoJson, null, 4));
                    await writablejson.close();
                    const saveExampleHandle = await modelDirHandle.getFileHandle("example.txt", {create: true});
                    const writableExample = await saveExampleHandle.createWritable();
                    await writableExample.write(triggerWord + '\n\n');
                    for (const str of promptList) {
                        await writableExample.write(str + '\n\n');
                    }
                    await writableExample.close();
                }
            }
        }
        alert("封面信息下载完成");
    }

    // --------- Civitai功能部分（新版接口+图片外层目录） -----------
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
        const dirHandle = await window.showDirectoryPicker({mode: "readwrite"});

        // 拉取模型数据（GET）
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

        let promptList = [];
        if (Array.isArray(version.images)) {
            promptList = version.images
                .filter(img => img.meta && img.meta.prompt)
                .map(img => img.meta.prompt);
        }
        let coverImageUrl = null;
        let coverExt = '';
        if (Array.isArray(version.images) && version.images.length > 0) {
            const coverImgObj = version.images.find(img => img.type === 'image') || version.images[0];
            coverImageUrl = coverImgObj.url;
            if (coverImageUrl) {
                coverExt = coverImageUrl.split('.').pop().split('?')[0];
            }
        }
        // 下载封面图片（外层）
        if (coverImageUrl) {
            try {
                const resp = await fetch(coverImageUrl);
                const blob = await resp.blob();
                const fileName = model_name_ver + "." + coverExt;
                const picHandle = await dirHandle.getFileHandle(fileName, {create: true});
                const writable = await picHandle.createWritable();
                await writable.write(blob);
                await writable.close();
            } catch (e) {
                alert("下载封面图片失败: " + e);
            }
        }
        // 保存模型信息为JSON
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
            fromUrl: window.location.href
        };
        const modelDirHandle = await dirHandle.getDirectoryHandle(model_name_ver, {create: true});
        const savejsonHandle = await modelDirHandle.getFileHandle(modelName + ".json", {create: true});
        const writablejson = await savejsonHandle.createWritable();
        await writablejson.write(JSON.stringify(modelInfo, null, 4));
        await writablejson.close();
        // 保存提示词为txt
        const saveExampleHandle = await modelDirHandle.getFileHandle("example.txt", {create: true});
        const writableExample = await saveExampleHandle.createWritable();
        await writableExample.write(triggerWords + '\n\n');
        for (const str of promptList) {
            await writableExample.write(str + '\n\n');
        }
        await writableExample.close();
        alert("封面信息下载完成");
    }

    // --------- 按钮插入和监听部分（按原位插入） -----------
    function createButtons(site) {
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
    }

    // 监听页面跳转，自动插入按钮
    function observeUrlChange(site) {
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                setTimeout(() => {
                    if (document.getElementById('model-helper-btn')) {
                        document.getElementById('model-helper-btn').remove();
                    }
                    createButtons(site);
                }, 1000);
            }
        }, 1000);
    }

    // --------- 主入口 -----------
    (function () {
        const site = window.location.hostname.includes('liblib') ? 'liblib'
                  : window.location.hostname.includes('civitai') ? 'civitai'
                  : 'unknown';
        setTimeout(() => createButtons(site), 1000);
        observeUrlChange(site);
    })();

})();