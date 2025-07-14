// Enhanced Content Script for ETA Invoice Exporter - Vanilla JavaScript
class ETAContentScript {
    constructor() {
        this.isInitialized = false;
        this.currentData = null;
        this.performanceMode = 'auto';
        this.init();
    }

    init() {
        if (this.isInitialized) return;
        
        console.log('ETA Invoice Exporter: Content script initializing...');
        
        // Wait for page to be fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
        
        this.setupMessageListener();
        this.isInitialized = true;
    }

    setup() {
        // Add visual indicator
        this.addIndicator();
        
        // Monitor for dynamic content changes
        this.setupObserver();
        
        console.log('ETA Invoice Exporter: Content script ready');
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.action) {
                case 'ping':
                    sendResponse({ success: true, ready: true });
                    break;

                case 'getInvoiceData':
                    const data = await this.getInvoiceData();
                    sendResponse({ success: true, data: data });
                    break;

                case 'getAllPagesData':
                    const allData = await this.getAllPagesData(message.options);
                    sendResponse({ success: true, data: allData });
                    break;

                case 'getInvoiceDetails':
                    const details = await this.getInvoiceDetails(message.invoiceId);
                    sendResponse({ success: true, data: details });
                    break;

                case 'setPerformanceMode':
                    this.performanceMode = message.mode;
                    sendResponse({ success: true });
                    break;

                case 'adjustBatchSize':
                    this.batchSize = message.newSize;
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    addIndicator() {
        // Remove existing indicator
        const existing = document.getElementById('eta-exporter-indicator');
        if (existing) existing.remove();

        // Create new indicator
        const indicator = document.createElement('div');
        indicator.id = 'eta-exporter-indicator';
        indicator.innerHTML = '⚡ ETA Exporter Ready';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            z-index: 10000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(indicator);

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.style.opacity = '0';
                indicator.style.transition = 'opacity 0.3s ease-out';
                setTimeout(() => indicator.remove(), 300);
            }
        }, 3000);
    }

    setupObserver() {
        // Monitor for table changes
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if new table content was added
                    const hasTable = Array.from(mutation.addedNodes).some(node => 
                        node.nodeType === 1 && (
                            node.querySelector && node.querySelector('table') ||
                            node.tagName === 'TABLE'
                        )
                    );
                    
                    if (hasTable) {
                        // Clear cached data when table changes
                        this.currentData = null;
                    }
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async getInvoiceData() {
        try {
            // Try API first for better performance
            const apiData = await this.tryAPIExtraction();
            if (apiData && apiData.invoices && apiData.invoices.length > 0) {
                console.log('Data extracted via API:', apiData.invoices.length, 'invoices');
                return apiData;
            }

            // Fallback to DOM extraction
            console.log('API extraction failed, trying DOM extraction...');
            return await this.extractFromDOM();
        } catch (error) {
            console.error('Error getting invoice data:', error);
            throw new Error('فشل في استخراج بيانات الفواتير: ' + error.message);
        }
    }

    async tryAPIExtraction() {
        try {
            // Look for API endpoints in network requests or page data
            const apiEndpoints = this.findAPIEndpoints();
            
            for (const endpoint of apiEndpoints) {
                try {
                    const response = await this.makeAPIRequest(endpoint);
                    if (response && response.data) {
                        return this.processAPIResponse(response);
                    }
                } catch (apiError) {
                    console.log('API endpoint failed:', endpoint, apiError);
                    continue;
                }
            }

            return null;
        } catch (error) {
            console.log('API extraction failed:', error);
            return null;
        }
    }

    findAPIEndpoints() {
        const endpoints = [];
        
        // Common ETA API patterns
        const baseUrl = window.location.origin;
        const commonPaths = [
            '/api/v1/documents/search',
            '/api/documents/list',
            '/documents/api/search',
            '/api/invoices/search'
        ];

        commonPaths.forEach(path => {
            endpoints.push(baseUrl + path);
        });

        // Look for endpoints in page scripts
        const scripts = document.querySelectorAll('script');
        scripts.forEach(script => {
            if (script.textContent) {
                const apiMatches = script.textContent.match(/['"](\/api\/[^'"]+)['"]/g);
                if (apiMatches) {
                    apiMatches.forEach(match => {
                        const cleanPath = match.replace(/['"]/g, '');
                        if (cleanPath.includes('document') || cleanPath.includes('invoice')) {
                            endpoints.push(baseUrl + cleanPath);
                        }
                    });
                }
            }
        });

        return [...new Set(endpoints)]; // Remove duplicates
    }

    async makeAPIRequest(endpoint) {
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };

        // Try to get auth token from page
        const authToken = this.extractAuthToken();
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Get current page parameters
        const urlParams = new URLSearchParams(window.location.search);
        const requestData = {
            page: parseInt(urlParams.get('page')) || 1,
            size: parseInt(urlParams.get('size')) || 10,
            sortBy: urlParams.get('sortBy') || 'issueDate',
            sortDirection: urlParams.get('sortDirection') || 'desc'
        };

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData)
        });

        if (response.ok) {
            return await response.json();
        }

        throw new Error(`API request failed: ${response.status}`);
    }

    extractAuthToken() {
        // Try multiple methods to get auth token
        const methods = [
            () => localStorage.getItem('authToken'),
            () => localStorage.getItem('token'),
            () => sessionStorage.getItem('authToken'),
            () => sessionStorage.getItem('token'),
            () => {
                const cookies = document.cookie.split(';');
                for (const cookie of cookies) {
                    const [name, value] = cookie.trim().split('=');
                    if (name.includes('token') || name.includes('auth')) {
                        return value;
                    }
                }
                return null;
            }
        ];

        for (const method of methods) {
            try {
                const token = method();
                if (token && token.length > 10) {
                    return token;
                }
            } catch (error) {
                continue;
            }
        }

        return null;
    }

    processAPIResponse(response) {
        const invoices = [];
        let totalCount = 0;
        let currentPage = 1;
        let totalPages = 1;

        // Handle different API response formats
        if (response.data && Array.isArray(response.data)) {
            response.data.forEach(item => {
                invoices.push(this.normalizeInvoiceData(item));
            });
        } else if (response.content && Array.isArray(response.content)) {
            response.content.forEach(item => {
                invoices.push(this.normalizeInvoiceData(item));
            });
        } else if (response.items && Array.isArray(response.items)) {
            response.items.forEach(item => {
                invoices.push(this.normalizeInvoiceData(item));
            });
        }

        // Extract pagination info
        totalCount = response.totalElements || response.total || response.totalCount || invoices.length;
        currentPage = (response.number || response.page || response.currentPage || 1) + (response.number !== undefined ? 1 : 0);
        totalPages = response.totalPages || Math.ceil(totalCount / (response.size || 10));

        return {
            invoices: invoices,
            totalCount: totalCount,
            currentPage: currentPage,
            totalPages: totalPages
        };
    }

    normalizeInvoiceData(item) {
        return {
            serialNumber: item.serialNumber || item.id || '',
            documentType: item.documentType || item.type || 'فاتورة',
            documentVersion: item.documentVersion || item.version || '1.0',
            status: item.status || item.documentStatus || '',
            issueDate: this.formatDate(item.issueDate || item.dateTimeIssued),
            submissionDate: this.formatDate(item.submissionDate || item.dateTimeReceived),
            invoiceCurrency: item.invoiceCurrency || item.currency || 'EGP',
            invoiceValue: this.formatAmount(item.invoiceValue || item.totalSalesAmount),
            vatAmount: this.formatAmount(item.vatAmount || item.totalTaxAmount),
            taxDiscount: this.formatAmount(item.taxDiscount || item.totalDiscountAmount || '0'),
            totalAmount: this.formatAmount(item.totalAmount || item.totalAmountEGP),
            internalNumber: item.internalNumber || item.internalId || '',
            electronicNumber: item.electronicNumber || item.uuid || item.submissionUUID || '',
            sellerTaxNumber: item.sellerTaxNumber || (item.issuer && item.issuer.id) || '',
            sellerName: item.sellerName || (item.issuer && item.issuer.name) || '',
            sellerAddress: item.sellerAddress || (item.issuer && item.issuer.address) || '',
            buyerTaxNumber: item.buyerTaxNumber || (item.receiver && item.receiver.id) || '',
            buyerName: item.buyerName || (item.receiver && item.receiver.name) || '',
            buyerAddress: item.buyerAddress || (item.receiver && item.receiver.address) || '',
            purchaseOrderRef: item.purchaseOrderRef || item.purchaseOrderReference || '',
            purchaseOrderDesc: item.purchaseOrderDesc || item.purchaseOrderDescription || '',
            salesOrderRef: item.salesOrderRef || item.salesOrderReference || '',
            electronicSignature: item.electronicSignature || 'موقع إلكترونياً',
            foodDrugGuide: item.foodDrugGuide || '',
            externalLink: item.externalLink || ''
        };
    }

    async extractFromDOM() {
        // Wait for table to be fully loaded
        await this.waitForTable();

        const table = this.findInvoiceTable();
        if (!table) {
            throw new Error('لم يتم العثور على جدول الفواتير في الصفحة');
        }

        const invoices = this.extractInvoicesFromTable(table);
        const paginationInfo = this.extractPaginationInfo();

        return {
            invoices: invoices,
            totalCount: paginationInfo.totalCount,
            currentPage: paginationInfo.currentPage,
            totalPages: paginationInfo.totalPages
        };
    }

    async waitForTable(maxWait = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            const table = this.findInvoiceTable();
            if (table && table.querySelectorAll('tbody tr').length > 0) {
                // Wait a bit more for dynamic content
                await new Promise(resolve => setTimeout(resolve, 500));
                return table;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        throw new Error('انتهت مهلة انتظار تحميل الجدول');
    }

    findInvoiceTable() {
        // Multiple strategies to find the invoice table
        const selectors = [
            'table[class*="invoice"]',
            'table[class*="document"]',
            'table[id*="invoice"]',
            'table[id*="document"]',
            '.table-responsive table',
            '.data-table table',
            'table tbody tr td:first-child', // Look for tables with serial numbers
            'table'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const table = element.tagName === 'TABLE' ? element : element.closest('table');
                if (table && this.isInvoiceTable(table)) {
                    return table;
                }
            }
        }

        // Fallback: find table with most rows
        const allTables = document.querySelectorAll('table');
        let bestTable = null;
        let maxRows = 0;

        allTables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr, tr');
            if (rows.length > maxRows && this.looksLikeInvoiceTable(table)) {
                maxRows = rows.length;
                bestTable = table;
            }
        });

        return bestTable;
    }

    isInvoiceTable(table) {
        const text = table.textContent.toLowerCase();
        const invoiceKeywords = [
            'فاتورة', 'invoice', 'مستند', 'document', 'رقم إلكتروني', 'electronic',
            'ضريبة', 'tax', 'قيمة', 'amount', 'تاريخ', 'date', 'حالة', 'status'
        ];

        return invoiceKeywords.some(keyword => text.includes(keyword));
    }

    looksLikeInvoiceTable(table) {
        const headers = table.querySelectorAll('th, thead td');
        if (headers.length < 5) return false; // Invoice tables usually have many columns

        const headerText = Array.from(headers).map(h => h.textContent.toLowerCase()).join(' ');
        const invoiceIndicators = ['رقم', 'تاريخ', 'قيمة', 'حالة', 'نوع'];
        
        return invoiceIndicators.filter(indicator => headerText.includes(indicator)).length >= 3;
    }

    extractInvoicesFromTable(table) {
        const invoices = [];
        const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');

        rows.forEach((row, index) => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 5) return; // Skip rows with too few cells

            const invoice = this.extractInvoiceFromRow(cells, index + 1);
            if (invoice.electronicNumber || invoice.internalNumber) {
                invoices.push(invoice);
            }
        });

        return invoices;
    }

    extractInvoiceFromRow(cells, serialNumber) {
        const getText = (index) => {
            if (index >= 0 && index < cells.length) {
                const cell = cells[index];
                const button = cell.querySelector('button, a');
                if (button && button.textContent.trim()) {
                    return button.textContent.trim();
                }
                return cell.textContent.trim();
            }
            return '';
        };

        // Try to detect column positions based on content patterns
        const columnMap = this.detectColumnPositions(cells);

        return {
            serialNumber: serialNumber.toString(),
            documentType: getText(columnMap.documentType) || 'فاتورة',
            documentVersion: getText(columnMap.documentVersion) || '1.0',
            status: getText(columnMap.status),
            issueDate: this.formatDate(getText(columnMap.issueDate)),
            submissionDate: this.formatDate(getText(columnMap.submissionDate)),
            invoiceCurrency: getText(columnMap.invoiceCurrency) || 'EGP',
            invoiceValue: this.formatAmount(getText(columnMap.invoiceValue)),
            vatAmount: this.formatAmount(getText(columnMap.vatAmount)),
            taxDiscount: this.formatAmount(getText(columnMap.taxDiscount)) || '0',
            totalAmount: this.formatAmount(getText(columnMap.totalAmount)),
            internalNumber: getText(columnMap.internalNumber),
            electronicNumber: getText(columnMap.electronicNumber),
            sellerTaxNumber: getText(columnMap.sellerTaxNumber),
            sellerName: getText(columnMap.sellerName),
            sellerAddress: getText(columnMap.sellerAddress),
            buyerTaxNumber: getText(columnMap.buyerTaxNumber),
            buyerName: getText(columnMap.buyerName),
            buyerAddress: getText(columnMap.buyerAddress),
            purchaseOrderRef: getText(columnMap.purchaseOrderRef),
            purchaseOrderDesc: getText(columnMap.purchaseOrderDesc),
            salesOrderRef: getText(columnMap.salesOrderRef),
            electronicSignature: 'موقع إلكترونياً',
            foodDrugGuide: getText(columnMap.foodDrugGuide),
            externalLink: getText(columnMap.externalLink)
        };
    }

    detectColumnPositions(cells) {
        const positions = {};
        
        cells.forEach((cell, index) => {
            const text = cell.textContent.toLowerCase().trim();
            const hasButton = cell.querySelector('button, a') !== null;
            
            // Detect patterns
            if (hasButton && text.includes('عرض')) {
                positions.detailsButton = index;
            } else if (text.match(/^\d{4}-\d{2}-\d{2}/) || text.match(/\d{1,2}\/\d{1,2}\/\d{4}/)) {
                if (!positions.issueDate) positions.issueDate = index;
                else positions.submissionDate = index;
            } else if (text.match(/[\d,]+\.\d{2}/) || text.match(/[\d,٬]+/)) {
                if (!positions.invoiceValue) positions.invoiceValue = index;
                else if (!positions.vatAmount) positions.vatAmount = index;
                else if (!positions.totalAmount) positions.totalAmount = index;
            } else if (text.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
                positions.electronicNumber = index;
            } else if (text.match(/^\d+$/)) {
                if (!positions.internalNumber) positions.internalNumber = index;
            } else if (text.includes('فاتورة') || text.includes('invoice')) {
                positions.documentType = index;
            } else if (text.includes('مقبول') || text.includes('مرفوض') || text.includes('valid') || text.includes('invalid')) {
                positions.status = index;
            }
        });

        // Fill in missing positions with best guesses
        const totalCells = cells.length;
        if (!positions.serialNumber) positions.serialNumber = 0;
        if (!positions.detailsButton) positions.detailsButton = 1;
        if (!positions.documentType) positions.documentType = 2;
        if (!positions.status) positions.status = 4;
        if (!positions.issueDate) positions.issueDate = 5;
        if (!positions.invoiceValue) positions.invoiceValue = 8;
        if (!positions.totalAmount) positions.totalAmount = 11;
        if (!positions.internalNumber) positions.internalNumber = 12;
        if (!positions.electronicNumber) positions.electronicNumber = 13;

        return positions;
    }

    extractPaginationInfo() {
        let totalCount = 0;
        let currentPage = 1;
        let totalPages = 1;

        // Strategy 1: Look for pagination text patterns
        const paginationSelectors = [
            '.pagination-info',
            '.page-info',
            '.results-info',
            '[class*="pagination"]',
            '[class*="page"]'
        ];

        for (const selector of paginationSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                const text = element.textContent;
                const info = this.parsePaginationText(text);
                if (info.totalCount > 0) {
                    return info;
                }
            }
        }

        // Strategy 2: Look for pagination controls
        const pageButtons = document.querySelectorAll('.page-link, .page-item, [class*="page"]');
        if (pageButtons.length > 0) {
            const pageNumbers = [];
            pageButtons.forEach(button => {
                const num = parseInt(button.textContent.trim());
                if (!isNaN(num) && num > 0) {
                    pageNumbers.push(num);
                }
            });
            
            if (pageNumbers.length > 0) {
                totalPages = Math.max(...pageNumbers);
                
                // Try to find current page
                const activeButton = document.querySelector('.page-item.active, .page-link.active, [class*="active"][class*="page"]');
                if (activeButton) {
                    currentPage = parseInt(activeButton.textContent.trim()) || 1;
                }
            }
        }

        // Strategy 3: Look in URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const urlPage = parseInt(urlParams.get('page')) || parseInt(urlParams.get('p'));
        if (urlPage) {
            currentPage = urlPage;
        }

        // Strategy 4: Estimate from table size and common page sizes
        const table = this.findInvoiceTable();
        if (table) {
            const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
            const currentPageCount = rows.length;
            
            // Common page sizes
            const commonSizes = [10, 20, 25, 50, 100];
            const likelyPageSize = commonSizes.find(size => currentPageCount <= size) || currentPageCount;
            
            // Look for total count indicators
            const totalText = document.body.textContent;
            const totalMatches = totalText.match(/(\d+)\s*(?:من|of|total|إجمالي)/gi);
            if (totalMatches) {
                const numbers = totalMatches.map(match => parseInt(match.match(/\d+/)[0]));
                totalCount = Math.max(...numbers);
                totalPages = Math.ceil(totalCount / likelyPageSize);
            } else {
                // Estimate based on current page size
                totalCount = currentPageCount * (totalPages || 1);
            }
        }

        return {
            totalCount: Math.max(totalCount, 0),
            currentPage: Math.max(currentPage, 1),
            totalPages: Math.max(totalPages, 1)
        };
    }

    parsePaginationText(text) {
        const patterns = [
            /(\d+)\s*-\s*(\d+)\s*من\s*(\d+)/,  // "1-10 من 100"
            /(\d+)\s*to\s*(\d+)\s*of\s*(\d+)/i, // "1 to 10 of 100"
            /صفحة\s*(\d+)\s*من\s*(\d+)/,        // "صفحة 1 من 10"
            /page\s*(\d+)\s*of\s*(\d+)/i,       // "page 1 of 10"
            /إجمالي\s*(\d+)/,                   // "إجمالي 100"
            /total\s*(\d+)/i                    // "total 100"
        ];

        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                if (match.length === 4) {
                    // Range pattern (start-end of total)
                    return {
                        totalCount: parseInt(match[3]),
                        currentPage: Math.ceil(parseInt(match[1]) / (parseInt(match[2]) - parseInt(match[1]) + 1)),
                        totalPages: Math.ceil(parseInt(match[3]) / (parseInt(match[2]) - parseInt(match[1]) + 1))
                    };
                } else if (match.length === 3) {
                    // Page pattern (page X of Y)
                    return {
                        totalCount: 0, // Will be calculated later
                        currentPage: parseInt(match[1]),
                        totalPages: parseInt(match[2])
                    };
                } else if (match.length === 2) {
                    // Total pattern
                    return {
                        totalCount: parseInt(match[1]),
                        currentPage: 1,
                        totalPages: 1
                    };
                }
            }
        }

        return { totalCount: 0, currentPage: 1, totalPages: 1 };
    }

    async getAllPagesData(options = {}) {
        const allInvoices = [];
        const paginationInfo = this.extractPaginationInfo();
        const totalPages = paginationInfo.totalPages;
        
        console.log(`Starting to load ${totalPages} pages...`);

        // Determine batch size based on performance mode
        let batchSize = 3;
        if (this.performanceMode === 'fast') {
            batchSize = 5;
        } else if (this.performanceMode === 'safe') {
            batchSize = 1;
        }

        // Load pages in batches
        for (let i = 1; i <= totalPages; i += batchSize) {
            const batch = [];
            const endPage = Math.min(i + batchSize - 1, totalPages);
            
            // Create batch of page load promises
            for (let page = i; page <= endPage; page++) {
                batch.push(this.loadPageData(page));
            }

            // Send progress update
            this.sendProgressUpdate({
                currentPage: i,
                totalPages: totalPages,
                message: `جاري تحميل الصفحات ${i}-${endPage} من ${totalPages}...`
            });

            try {
                // Execute batch in parallel
                const batchResults = await Promise.all(batch);
                
                // Combine results
                batchResults.forEach(pageData => {
                    if (pageData && pageData.length > 0) {
                        allInvoices.push(...pageData);
                    }
                });

                // Small delay between batches to prevent overwhelming the server
                if (endPage < totalPages) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            } catch (error) {
                console.error(`Error loading batch ${i}-${endPage}:`, error);
                // Continue with next batch even if current batch fails
            }
        }

        console.log(`Loaded ${allInvoices.length} invoices from ${totalPages} pages`);
        return allInvoices;
    }

    async loadPageData(pageNumber) {
        try {
            // If we're already on the target page, extract data directly
            const currentPageInfo = this.extractPaginationInfo();
            if (currentPageInfo.currentPage === pageNumber) {
                const currentData = await this.getInvoiceData();
                return currentData.invoices;
            }

            // Navigate to the target page
            await this.navigateToPage(pageNumber);
            
            // Wait for page to load
            await this.waitForPageLoad();
            
            // Extract data from the new page
            const pageData = await this.getInvoiceData();
            return pageData.invoices;
            
        } catch (error) {
            console.error(`Error loading page ${pageNumber}:`, error);
            return [];
        }
    }

    async navigateToPage(pageNumber) {
        // Strategy 1: Click pagination button
        const pageButton = document.querySelector(`[data-page="${pageNumber}"], .page-link[href*="page=${pageNumber}"]`);
        if (pageButton) {
            pageButton.click();
            return;
        }

        // Strategy 2: Look for numbered page buttons
        const pageButtons = document.querySelectorAll('.page-link, .page-item a, [class*="page"] a');
        for (const button of pageButtons) {
            if (button.textContent.trim() === pageNumber.toString()) {
                button.click();
                return;
            }
        }

        // Strategy 3: Modify URL parameters
        const url = new URL(window.location);
        url.searchParams.set('page', pageNumber);
        window.history.pushState({}, '', url);
        window.location.reload();
    }

    async waitForPageLoad() {
        // Wait for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Wait for table to be updated
        await this.waitForTable();
        
        // Additional wait for dynamic content
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    sendProgressUpdate(progress) {
        try {
            chrome.runtime.sendMessage({
                action: 'progressUpdate',
                progress: progress
            });
        } catch (error) {
            console.log('Could not send progress update:', error);
        }
    }

    async getInvoiceDetails(invoiceId) {
        try {
            // Try to find and click the details button for this invoice
            const detailsButton = this.findDetailsButton(invoiceId);
            if (detailsButton) {
                return await this.extractDetailsFromModal(detailsButton);
            }

            // Fallback: try API call for details
            return await this.getDetailsFromAPI(invoiceId);
        } catch (error) {
            console.error('Error getting invoice details:', error);
            return [];
        }
    }

    findDetailsButton(invoiceId) {
        // Look for buttons in the same row as the invoice ID
        const rows = document.querySelectorAll('tr');
        for (const row of rows) {
            if (row.textContent.includes(invoiceId)) {
                const button = row.querySelector('button[onclick*="details"], button[onclick*="view"], a[href*="details"]');
                if (button) return button;
            }
        }
        return null;
    }

    async extractDetailsFromModal(button) {
        // Click the button and wait for modal/details to load
        button.click();
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Look for details table or modal
        const detailsContainer = document.querySelector('.modal-body, .details-container, [class*="detail"]');
        if (detailsContainer) {
            const detailsTable = detailsContainer.querySelector('table');
            if (detailsTable) {
                return this.extractItemsFromDetailsTable(detailsTable);
            }
        }
        
        return [];
    }

    extractItemsFromDetailsTable(table) {
        const items = [];
        const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 4) {
                items.push({
                    itemCode: cells[0]?.textContent.trim() || '',
                    description: cells[1]?.textContent.trim() || '',
                    quantity: cells[2]?.textContent.trim() || '1',
                    unitPrice: cells[3]?.textContent.trim() || '0',
                    totalValue: cells[4]?.textContent.trim() || '0',
                    vatAmount: cells[5]?.textContent.trim() || '0'
                });
            }
        });
        
        return items;
    }

    async getDetailsFromAPI(invoiceId) {
        // Try to make API call for invoice details
        const apiEndpoints = [
            `/api/v1/documents/${invoiceId}/details`,
            `/api/documents/${invoiceId}/items`,
            `/documents/api/${invoiceId}/details`
        ];

        for (const endpoint of apiEndpoints) {
            try {
                const response = await this.makeAPIRequest(window.location.origin + endpoint);
                if (response && response.data) {
                    return response.data.map(item => this.normalizeItemData(item));
                }
            } catch (error) {
                continue;
            }
        }

        return [];
    }

    normalizeItemData(item) {
        return {
            itemCode: item.itemCode || item.code || '',
            description: item.description || item.name || '',
            unitCode: item.unitCode || 'EA',
            unitName: item.unitName || 'قطعة',
            quantity: item.quantity || '1',
            unitPrice: this.formatAmount(item.unitPrice || item.price),
            totalValue: this.formatAmount(item.totalValue || item.total),
            taxAmount: this.formatAmount(item.taxAmount || '0'),
            vatAmount: this.formatAmount(item.vatAmount || item.vat),
            totalWithVat: this.formatAmount(item.totalWithVat || item.totalValue)
        };
    }

    formatDate(dateString) {
        if (!dateString) return '';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                // Try to parse Arabic/different formats
                return dateString.trim();
            }
            
            return date.toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (error) {
            return dateString.trim();
        }
    }

    formatAmount(amount) {
        if (!amount || amount === '0' || amount === '') return '';
        
        // Remove Arabic comma and other non-numeric characters except decimal point
        const cleanAmount = amount.toString().replace(/[,٬]/g, '').replace(/[^\d.-]/g, '');
        const numAmount = parseFloat(cleanAmount);
        
        if (isNaN(numAmount)) return amount.toString();
        
        return numAmount.toFixed(2);
    }
}

// Initialize the content script
if (typeof window !== 'undefined' && window.location.href.includes('invoicing.eta.gov.eg')) {
    new ETAContentScript();
}