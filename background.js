// Enhanced Background script for ETA Invoice Exporter
class ETABackground {
    constructor() {
        this.init();
    }

    init() {
        chrome.runtime.onInstalled.addListener((details) => {
            if (details.reason === 'install') {
                this.handleInstallation();
            }
        });

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tab);
            }
        });

        // Add performance monitoring
        this.setupPerformanceMonitoring();
    }

    setupPerformanceMonitoring() {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name === 'performance') {
                port.onMessage.addListener((msg) => {
                    if (msg.type === 'performance-data') {
                        console.log('Performance metrics:', msg.data);
                        this.optimizeBasedOnPerformance(msg.data);
                    }
                });
            }
        });
    }

    optimizeBasedOnPerformance(data) {
        if (data.memoryUsage > 100 * 1024 * 1024) { // 100MB
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'adjustBatchSize',
                        newSize: 3
                    }).catch(() => {});
                }
            });
        }
    }

    handleInstallation() {
        chrome.storage.local.set({
            installDate: new Date().toISOString(),
            version: '1.1.0',
            usageCount: 0,
            performanceMode: 'auto'
        });

        if (chrome.notifications) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'مُصدِّر الفواتير المحسن',
                message: 'تم تثبيت النسخة المحسنة! سرعة أعلى في تحميل البيانات.'
            });
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'checkTabUrl':
                    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    sendResponse({ 
                        isETASite: tab.url && tab.url.includes('invoicing.eta.gov.eg'),
                        url: tab.url 
                    });
                    break;

                case 'incrementUsage':
                    await this.incrementUsageCount();
                    sendResponse({ success: true });
                    break;

                case 'getUsageStats':
                    const stats = await this.getUsageStats();
                    sendResponse(stats);
                    break;

                case 'progressUpdate':
                    // Forward progress updates to popup if needed
                    break;

                case 'optimizePerformance':
                    await this.setPerformanceMode(message.mode);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Background script error:', error);
            sendResponse({ error: error.message });
        }
    }

    async setPerformanceMode(mode) {
        await chrome.storage.local.set({ performanceMode: mode });
        
        const tabs = await chrome.tabs.query({url: "https://invoicing.eta.gov.eg/*"});
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
                action: 'setPerformanceMode',
                mode: mode
            }).catch(() => {});
        });
    }

    handleTabUpdate(tab) {
        if (tab.url && tab.url.includes('invoicing.eta.gov.eg')) {
            // Clear any existing badge first
            chrome.action.setBadgeText({
                tabId: tab.id,
                text: ''
            });
            
            // Set new badge after a short delay
            setTimeout(() => {
                chrome.action.setBadgeText({
                    tabId: tab.id,
                    text: '⚡'
                });
            }, 500);
            
            chrome.action.setBadgeBackgroundColor({
                tabId: tab.id,
                color: '#10b981'
            });

            chrome.action.setTitle({
                tabId: tab.id,
                title: 'مُصدِّر الفواتير المحسن - جاهز للتحميل السريع'
            });
        } else {
            chrome.action.setBadgeText({
                tabId: tab.id,
                text: ''
            });

            chrome.action.setTitle({
                tabId: tab.id,
                title: 'مُصدِّر الفواتير المحسن'
            });
        }
    }

    async incrementUsageCount() {
        const result = await chrome.storage.local.get(['usageCount']);
        const newCount = (result.usageCount || 0) + 1;
        
        await chrome.storage.local.set({ 
            usageCount: newCount,
            lastUsed: new Date().toISOString()
        });

        if (newCount === 1) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'أول تصدير سريع!',
                message: 'تم تصدير البيانات بسرعة محسنة!'
            });
        } else if (newCount === 10) {
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icons/icon48.png',
                title: 'مستخدم نشط!',
                message: 'رائع! لقد قمت بتصدير 10 ملفات بسرعة عالية.'
            });
        }
    }

    async getUsageStats() {
        const result = await chrome.storage.local.get(['usageCount', 'installDate', 'lastUsed', 'performanceMode']);
        return {
            usageCount: result.usageCount || 0,
            installDate: result.installDate,
            lastUsed: result.lastUsed,
            performanceMode: result.performanceMode || 'auto'
        };
    }

    async storeData(key, value) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [key]: value }, resolve);
        });
    }

    async getData(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
            });
        });
    }
}

// Initialize background script
new ETABackground();