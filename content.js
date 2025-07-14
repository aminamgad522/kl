// Enhanced Content Script for ETA Invoice Exporter - Fixed Messaging
class ETAContentScript {
    constructor() {
        this.isInitialized = false;
        this.currentData = null;
        this.performanceMode = 'auto';
        this.batchSize = 3;
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
            console.log('Content script received message:', message.action);
            
            // Handle message asynchronously
            this.handleMessage(message, sender, sendResponse);
            
            // Always return true to keep message channel open
            return true;
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
                    this.setBatchSize();
                    sendResponse({ success: true });
                    break;

                case 'adjustBatchSize':
                    this.batchSize = message.newSize;
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action: ' + message.action });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    setBatchSize() {
        switch (this.performanceMode) {
            case 'fast':
                this.batchSize = 5;
                break;
            case 'safe':
                this.batchSize = 1;
                break;
            default:
                this.batchSize = 3;
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
                            (node.querySelector && node.querySelector('table')) ||
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
            console.log('Getting invoice data...');
            
            // Wait for table to be fully loaded
            await this.waitForTable();

            const table = this.findInvoiceTable();
            if (!table) {
                throw new Error('لم يتم العثور على جدول الفواتير في الصفحة');
            }

            const invoices = this.extractInvoicesFromTable(table);
            if (invoices.length === 0) {
                throw new Error('لم يتم العثور على فواتير في الجدول');
            }

            const paginationInfo = this.extractPaginationInfo();

            const result = {
                invoices: invoices,
                totalCount: paginationInfo.totalCount || invoices.length,
                currentPage: paginationInfo.currentPage || 1,
                totalPages: paginationInfo.totalPages || 1
            };

            console.log('Invoice data extracted:', result);
            return result;

        } catch (error) {
            console.error('Error getting invoice data:', error);
            throw new Error('فشل في استخراج بيانات الفواتير: ' + error.message);
        }
    }

    async waitForTable(maxWait = 10000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            const table = this.findInvoiceTable();
            if (table && table.querySelectorAll('tbody tr, tr').length > 1) {
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
            'table[class*="table"]',
            'table[class*="data"]',
            'table[id*="table"]',
            '.table-responsive table',
            '.data-table table',
            'table'
        ];

        for (const selector of selectors) {
            const tables = document.querySelectorAll(selector);
            for (const table of tables) {
                if (this.isInvoiceTable(table)) {
                    console.log('Found invoice table:', table);
                    return table;
                }
            }
        }

        // Fallback: find table with most rows that looks like invoice data
        const allTables = document.querySelectorAll('table');
        let bestTable = null;
        let maxRows = 0;

        allTables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr, tr');
            if (rows.length > maxRows && rows.length > 1) {
                maxRows = rows.length;
                bestTable = table;
            }
        });

        console.log('Best table found:', bestTable, 'with', maxRows, 'rows');
        return bestTable;
    }

    isInvoiceTable(table) {
        const text = table.textContent.toLowerCase();
        const invoiceKeywords = [
            'فاتورة', 'invoice', 'مستند', 'document', 'رقم', 'number',
            'تاريخ', 'date', 'حالة', 'status', 'قيمة', 'amount', 'مبلغ'
        ];

        const hasKeywords = invoiceKeywords.some(keyword => text.includes(keyword));
        const hasEnoughColumns = table.querySelectorAll('th, thead td').length >= 5;
        const hasEnoughRows = table.querySelectorAll('tbody tr, tr').length > 1;

        return hasKeywords && hasEnoughColumns && hasEnoughRows;
    }

    extractInvoicesFromTable(table) {
        const invoices = [];
        const rows = table.querySelectorAll('tbody tr');
        
        // If no tbody, try all rows except first (header)
        const dataRows = rows.length > 0 ? rows : Array.from(table.querySelectorAll('tr')).slice(1);

        console.log('Extracting from', dataRows.length, 'rows');

        dataRows.forEach((row, index) => {
            const cells = row.querySelectorAll('td, th');
            if (cells.length < 3) return; // Skip rows with too few cells

            const invoice = this.extractInvoiceFromRow(cells, index + 1);
            if (invoice && (invoice.electronicNumber || invoice.internalNumber || invoice.serialNumber)) {
                invoices.push(invoice);
            }
        });

        console.log('Extracted', invoices.length, 'invoices');
        return invoices;
    }

    extractInvoiceFromRow(cells, serialNumber) {
        const getText = (index) => {
            if (index >= 0 && index < cells.length) {
                const cell = cells[index];
                // Check for buttons or links first
                const button = cell.querySelector('button, a');
                if (button && button.textContent.trim()) {
                    return button.textContent.trim();
                }
                return cell.textContent.trim();
            }
            return '';
        };

        // Extract data from common positions
        const invoice = {
            serialNumber: serialNumber.toString(),
            documentType: getText(2) || 'فاتورة',
            documentVersion: getText(3) || '1.0',
            status: getText(4) || '',
            issueDate: this.formatDate(getText(5)),
            submissionDate: this.formatDate(getText(6)),
            invoiceCurrency: getText(7) || 'EGP',
            invoiceValue: this.formatAmount(getText(8)),
            vatAmount: this.formatAmount(getText(9)),
            taxDiscount: this.formatAmount(getText(10)) || '0',
            totalAmount: this.formatAmount(getText(11)),
            internalNumber: getText(12),
            electronicNumber: getText(13),
            sellerTaxNumber: getText(14),
            sellerName: getText(15),
            sellerAddress: getText(16),
            buyerTaxNumber: getText(17),
            buyerName: getText(18),
            buyerAddress: getText(19),
            purchaseOrderRef: getText(20),
            purchaseOrderDesc: getText(21),
            salesOrderRef: getText(22),
            electronicSignature: 'موقع إلكترونياً',
            foodDrugGuide: getText(24),
            externalLink: getText(25)
        };

        // Try to find key fields if not in expected positions
        if (!invoice.electronicNumber && !invoice.internalNumber) {
            for (let i = 0; i < cells.length; i++) {
                const text = getText(i);
                // Look for UUID pattern (electronic number)
                if (text.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)) {
                    invoice.electronicNumber = text;
                }
                // Look for internal number (usually numeric)
                else if (text.match(/^\d+$/) && text.length > 3) {
                    if (!invoice.internalNumber) {
                        invoice.internalNumber = text;
                    }
                }
                // Look for amounts
                else if (text.match(/[\d,]+\.\d{2}/) || text.match(/[\d,٬]+/)) {
                    if (!invoice.totalAmount && text.includes('.')) {
                        invoice.totalAmount = this.formatAmount(text);
                    }
                }
            }
        }

        return invoice;
    }

    extractPaginationInfo() {
        let totalCount = 0;
        let currentPage = 1;
        let totalPages = 1;

        // Strategy 1: Look for pagination text patterns
        const bodyText = document.body.textContent;
        
        // Common Arabic patterns
        const patterns = [
            /(\d+)\s*-\s*(\d+)\s*من\s*(\d+)/,  // "1-10 من 100"
            /صفحة\s*(\d+)\s*من\s*(\d+)/,        // "صفحة 1 من 10"
            /إجمالي\s*(\d+)/,                   // "إجمالي 100"
            /المجموع\s*(\d+)/,                  // "المجموع 100"
            /(\d+)\s*to\s*(\d+)\s*of\s*(\d+)/i, // "1 to 10 of 100"
            /page\s*(\d+)\s*of\s*(\d+)/i,       // "page 1 of 10"
            /total\s*(\d+)/i                    // "total 100"
        ];

        for (const pattern of patterns) {
            const match = bodyText.match(pattern);
            if (match) {
                if (match.length === 4) {
                    // Range pattern (start-end of total)
                    totalCount = parseInt(match[3]);
                    const pageSize = parseInt(match[2]) - parseInt(match[1]) + 1;
                    currentPage = Math.ceil(parseInt(match[1]) / pageSize);
                    totalPages = Math.ceil(totalCount / pageSize);
                    break;
                } else if (match.length === 3) {
                    // Page pattern (page X of Y)
                    currentPage = parseInt(match[1]);
                    totalPages = parseInt(match[2]);
                    break;
                } else if (match.length === 2) {
                    // Total pattern
                    totalCount = parseInt(match[1]);
                    break;
                }
            }
        }

        // Strategy 2: Look for pagination controls
        const pageButtons = document.querySelectorAll('.page-link, .page-item, [class*="page"]');
        if (pageButtons.length > 0 && totalPages === 1) {
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
        if (urlPage && currentPage === 1) {
            currentPage = urlPage;
        }

        // Strategy 4: Estimate from current table
        if (totalCount === 0) {
            const table = this.findInvoiceTable();
            if (table) {
                const rows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
                totalCount = rows.length * (totalPages || 1);
            }
        }

        const result = {
            totalCount: Math.max(totalCount, 0),
            currentPage: Math.max(currentPage, 1),
            totalPages: Math.max(totalPages, 1)
        };

        console.log('Pagination info:', result);
        return result;
    }

    async getAllPagesData(options = {}) {
        const allInvoices = [];
        const paginationInfo = this.extractPaginationInfo();
        const totalPages = paginationInfo.totalPages;
        
        console.log(`Starting to load ${totalPages} pages...`);

        // Load current page first
        const currentData = await this.getInvoiceData();
        allInvoices.push(...currentData.invoices);

        // If only one page, return current data
        if (totalPages <= 1) {
            return allInvoices;
        }

        // Load remaining pages in batches
        for (let i = 1; i <= totalPages; i += this.batchSize) {
            if (i === paginationInfo.currentPage) continue; // Skip current page

            const batch = [];
            const endPage = Math.min(i + this.batchSize - 1, totalPages);
            
            // Create batch of page load promises
            for (let page = i; page <= endPage; page++) {
                if (page !== paginationInfo.currentPage) {
                    batch.push(this.loadPageData(page));
                }
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

                // Small delay between batches
                if (endPage < totalPages) {
                    await new Promise(resolve => setTimeout(resolve, 300));
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
        const pageSelectors = [
            `a[href*="page=${pageNumber}"]`,
            `button[data-page="${pageNumber}"]`,
            `.page-link:contains("${pageNumber}")`,
            `.page-item a:contains("${pageNumber}")`
        ];

        for (const selector of pageSelectors) {
            const button = document.querySelector(selector);
            if (button) {
                button.click();
                return;
            }
        }

        // Strategy 2: Look for numbered page buttons
        const pageButtons = document.querySelectorAll('.page-link, .page-item a, [class*="page"] a, button');
        for (const button of pageButtons) {
            if (button.textContent.trim() === pageNumber.toString()) {
                button.click();
                return;
            }
        }

        // Strategy 3: Modify URL parameters
        const url = new URL(window.location);
        url.searchParams.set('page', pageNumber);
        window.location.href = url.toString();
    }

    async waitForPageLoad() {
        // Wait for navigation to complete
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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
            }).catch(() => {
                // Ignore messaging errors during progress updates
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

            // Return empty array if no details found
            return [];
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
                const button = row.querySelector('button, a[href*="details"], a[href*="view"]');
                if (button) return button;
            }
        }
        return null;
    }

    async extractDetailsFromModal(button) {
        // Click the button and wait for modal/details to load
        button.click();
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
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

    formatDate(dateString) {
        if (!dateString) return '';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) {
                // Return as-is if can't parse
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
    console.log('Initializing ETA Content Script...');
    new ETAContentScript();
}