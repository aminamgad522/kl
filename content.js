// Enhanced Content script for ETA Invoice Exporter - Fast Multi-Page Loading
class ETAContentScript {
  constructor() {
    this.invoiceData = [];
    this.allPagesData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.resultsPerPage = 50;
    this.isProcessingAllPages = false;
    this.progressCallback = null;
    this.domObserver = null;
    this.pageLoadTimeout = 10000; // Reduced from 20 seconds
    this.apiEndpoint = null;
    this.authHeaders = null;
    this.init();
  }
  
  init() {
    console.log('ETA Exporter: Content script initialized');
    this.detectAPIEndpoint();
    
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.scanForInvoices());
    } else {
      setTimeout(() => this.scanForInvoices(), 500); // Reduced delay
    }
    
    this.setupMutationObserver();
  }
  
  // NEW: API Detection for Direct Calls
  detectAPIEndpoint() {
    const originalFetch = window.fetch;
    const self = this;
    
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);
      self.analyzeRequest(args[0], args[1]);
      return response;
    };
    
    // Also intercept XMLHttpRequest
    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (url && url.includes('/api/') && url.includes('documents')) {
        self.apiEndpoint = url;
        self.extractAuthHeaders();
      }
      return originalXHR.call(this, method, url, ...args);
    };
  }
  
  analyzeRequest(url, options) {
    if (typeof url === 'string' && url.includes('/api/') && url.includes('documents')) {
      this.apiEndpoint = url;
      this.extractAuthHeaders();
    }
  }
  
  extractAuthHeaders() {
    const token = localStorage.getItem('authToken') || 
                 sessionStorage.getItem('authToken') ||
                 this.extractTokenFromCookies();
    
    if (token) {
      this.authHeaders = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
    }
  }
  
  extractTokenFromCookies() {
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name.includes('token') || name.includes('auth') || name.includes('session')) {
        return value;
      }
    }
    return null;
  }
  
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldRescan = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList?.contains('ms-DetailsRow') || 
                  node.querySelector?.('.ms-DetailsRow') ||
                  node.classList?.contains('ms-List-cell')) {
                shouldRescan = true;
              }
            }
          });
        }
      });
      
      if (shouldRescan && !this.isProcessingAllPages) {
        clearTimeout(this.rescanTimeout);
        this.rescanTimeout = setTimeout(() => this.scanForInvoices(), 500); // Reduced delay
      }
    });
    
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  scanForInvoices() {
    try {
      console.log('ETA Exporter: Starting invoice scan...');
      this.invoiceData = [];
      
      this.extractPaginationInfo();
      const rows = this.getVisibleInvoiceRows();
      console.log(`ETA Exporter: Found ${rows.length} visible invoice rows on page ${this.currentPage}`);
      
      if (rows.length === 0) {
        const alternativeRows = this.getAlternativeInvoiceRows();
        alternativeRows.forEach((row, index) => {
          const invoiceData = this.extractDataFromRow(row, index + 1);
          if (this.isValidInvoiceData(invoiceData)) {
            this.invoiceData.push(invoiceData);
          }
        });
      } else {
        rows.forEach((row, index) => {
          const invoiceData = this.extractDataFromRow(row, index + 1);
          if (this.isValidInvoiceData(invoiceData)) {
            this.invoiceData.push(invoiceData);
          }
        });
      }
      
      console.log(`ETA Exporter: Successfully extracted ${this.invoiceData.length} valid invoices from page ${this.currentPage}`);
      
    } catch (error) {
      console.error('ETA Exporter: Error scanning for invoices:', error);
    }
  }
  
  getVisibleInvoiceRows() {
    const selectors = [
      '.ms-DetailsRow[role="row"]',
      '.ms-List-cell[role="gridcell"]',
      '[data-list-index]',
      '.ms-DetailsRow',
      '[role="row"]'
    ];
    
    for (const selector of selectors) {
      const rows = document.querySelectorAll(selector);
      const visibleRows = Array.from(rows).filter(row => 
        this.isRowVisible(row) && this.hasInvoiceData(row)
      );
      
      if (visibleRows.length > 0) {
        return visibleRows;
      }
    }
    
    return [];
  }
  
  getAlternativeInvoiceRows() {
    const alternativeSelectors = [
      'tr[role="row"]',
      '.ms-List-cell',
      '[data-automation-key]',
      '.ms-DetailsRow-cell',
      'div[role="gridcell"]'
    ];
    
    const allRows = [];
    
    for (const selector of alternativeSelectors) {
      const elements = document.querySelectorAll(selector);
      Array.from(elements).forEach(element => {
        const row = element.closest('[role="row"]') || element.parentElement;
        if (row && this.hasInvoiceData(row) && !allRows.includes(row)) {
          allRows.push(row);
        }
      });
    }
    
    return allRows.filter(row => this.isRowVisible(row));
  }
  
  isRowVisible(row) {
    if (!row) return false;
    
    const rect = row.getBoundingClientRect();
    const style = window.getComputedStyle(row);
    
    return (
      rect.width > 0 && 
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  }
  
  hasInvoiceData(row) {
    if (!row) return false;
    
    const electronicNumber = row.querySelector('.internalId-link a, [data-automation-key="uuid"] a, .griCellTitle');
    const internalNumber = row.querySelector('.griCellSubTitle, [data-automation-key="uuid"] .griCellSubTitle');
    const totalAmount = row.querySelector('[data-automation-key="total"], .griCellTitleGray');
    
    return !!(electronicNumber?.textContent?.trim() || 
              internalNumber?.textContent?.trim() || 
              totalAmount?.textContent?.trim());
  }
  
  extractPaginationInfo() {
    try {
      this.totalCount = this.extractTotalCount();
      this.currentPage = this.extractCurrentPage();
      this.resultsPerPage = this.detectResultsPerPage();
      this.totalPages = Math.ceil(this.totalCount / this.resultsPerPage);
      
      this.currentPage = Math.max(this.currentPage, 1);
      this.totalPages = Math.max(this.totalPages, this.currentPage);
      this.totalCount = Math.max(this.totalCount, this.invoiceData.length);
      
      console.log(`ETA Exporter: Page ${this.currentPage} of ${this.totalPages}, Total: ${this.totalCount} invoices (${this.resultsPerPage} per page)`);
      
    } catch (error) {
      console.warn('ETA Exporter: Error extracting pagination info:', error);
      this.currentPage = 1;
      this.totalPages = this.findMaxPageNumber() || 1;
      this.totalCount = this.invoiceData.length;
    }
  }
  
  extractTotalCount() {
    const resultElements = document.querySelectorAll('*');
    
    for (const element of resultElements) {
      const text = element.textContent || '';
      
      const resultsMatch = text.match(/Results:\s*(\d+)/i);
      if (resultsMatch) {
        const count = parseInt(resultsMatch[1]);
        if (count > 0) {
          return count;
        }
      }
      
      const patterns = [
        /(\d+)\s*results/i,
        /total:\s*(\d+)/i,
        /النتائج:\s*(\d+)/i,
        /(\d+)\s*نتيجة/i,
        /من\s*(\d+)/i,
        /إجمالي:\s*(\d+)/i
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const count = parseInt(match[1]);
          if (count > 0) {
            return count;
          }
        }
      }
    }
    
    return 0;
  }
  
  detectResultsPerPage() {
    const currentPageRows = this.invoiceData.length;
    
    if (this.currentPage < this.totalPages && currentPageRows > 0) {
      return currentPageRows;
    }
    
    const commonPageSizes = [10, 20, 25, 50, 100];
    
    if (currentPageRows > 0) {
      for (const size of commonPageSizes) {
        if (currentPageRows <= size) {
          return size;
        }
      }
      return currentPageRows;
    }
    
    return 50;
  }
  
  extractCurrentPage() {
    const activePageSelectors = [
      '.ms-Button--primary[aria-pressed="true"]',
      '[aria-current="page"]',
      '.active',
      '.selected',
      '.current',
      '[class*="active"]',
      '[class*="selected"]'
    ];
    
    for (const selector of activePageSelectors) {
      const activeButton = document.querySelector(selector);
      if (activeButton) {
        const pageText = activeButton.textContent?.trim();
        const pageNum = parseInt(pageText);
        if (!isNaN(pageNum) && pageNum > 0) {
          return pageNum;
        }
      }
    }
    
    const pageButtons = document.querySelectorAll('button, a');
    for (const button of pageButtons) {
      const text = button.textContent?.trim();
      const pageNum = parseInt(text);
      
      if (!isNaN(pageNum) && pageNum > 0) {
        const classes = button.className || '';
        const ariaPressed = button.getAttribute('aria-pressed');
        const ariaCurrent = button.getAttribute('aria-current');
        
        if (ariaPressed === 'true' || ariaCurrent === 'page' || 
            classes.includes('active') || classes.includes('selected') ||
            classes.includes('primary')) {
          return pageNum;
        }
      }
    }
    
    return 1;
  }
  
  findMaxPageNumber() {
    const pageButtons = document.querySelectorAll('button, a');
    let maxPage = 1;
    
    pageButtons.forEach(btn => {
      const buttonText = btn.textContent?.trim();
      const pageNum = parseInt(buttonText);
      
      if (!isNaN(pageNum) && pageNum > maxPage) {
        maxPage = pageNum;
      }
    });
    
    return maxPage;
  }
  
  extractDataFromRow(row, index) {
    const invoice = {
      index: index,
      pageNumber: this.currentPage,
      
      serialNumber: index,
      viewButton: 'عرض',
      documentType: 'فاتورة',
      documentVersion: '1.0',
      status: '',
      issueDate: '',
      submissionDate: '',
      invoiceCurrency: 'EGP',
      invoiceValue: '',
      vatAmount: '',
      taxDiscount: '0',
      totalInvoice: '',
      internalNumber: '',
      electronicNumber: '',
      sellerTaxNumber: '',
      sellerName: '',
      sellerAddress: '',
      buyerTaxNumber: '',
      buyerName: '',
      buyerAddress: '',
      purchaseOrderRef: '',
      purchaseOrderDesc: '',
      salesOrderRef: '',
      electronicSignature: 'موقع إلكترونياً',
      foodDrugGuide: '',
      externalLink: '',
      
      issueTime: '',
      totalAmount: '',
      currency: 'EGP',
      submissionId: '',
      details: []
    };
    
    try {
      this.extractUsingDataAttributes(row, invoice);
      this.extractUsingCellPositions(row, invoice);
      this.extractUsingTextContent(row, invoice);
      
      if (invoice.electronicNumber) {
        invoice.externalLink = this.generateExternalLink(invoice);
      }
      
    } catch (error) {
      console.warn(`ETA Exporter: Error extracting data from row ${index}:`, error);
    }
    
    return invoice;
  }
  
  extractUsingDataAttributes(row, invoice) {
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, [data-automation-key]');
    
    cells.forEach(cell => {
      const key = cell.getAttribute('data-automation-key');
      
      switch (key) {
        case 'uuid':
          const electronicLink = cell.querySelector('.internalId-link a.griCellTitle, a');
          if (electronicLink) {
            invoice.electronicNumber = electronicLink.textContent?.trim() || '';
          }
          
          const internalNumberElement = cell.querySelector('.griCellSubTitle');
          if (internalNumberElement) {
            invoice.internalNumber = internalNumberElement.textContent?.trim() || '';
          }
          break;
          
        case 'dateTimeReceived':
          const dateElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const timeElement = cell.querySelector('.griCellSubTitle');
          
          if (dateElement) {
            invoice.issueDate = dateElement.textContent?.trim() || '';
            invoice.submissionDate = invoice.issueDate;
          }
          if (timeElement) {
            invoice.issueTime = timeElement.textContent?.trim() || '';
          }
          break;
          
        case 'typeName':
          const typeElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const versionElement = cell.querySelector('.griCellSubTitle');
          
          if (typeElement) {
            invoice.documentType = typeElement.textContent?.trim() || 'فاتورة';
          }
          if (versionElement) {
            invoice.documentVersion = versionElement.textContent?.trim() || '1.0';
          }
          break;
          
        case 'total':
          const totalElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          if (totalElement) {
            const totalText = totalElement.textContent?.trim() || '';
            invoice.totalAmount = totalText;
            invoice.totalInvoice = totalText;
            
            const totalValue = this.parseAmount(totalText);
            if (totalValue > 0) {
              const vatRate = 0.14;
              const vatAmount = (totalValue * vatRate) / (1 + vatRate);
              const invoiceValue = totalValue - vatAmount;
              
              invoice.vatAmount = this.formatAmount(vatAmount);
              invoice.invoiceValue = this.formatAmount(invoiceValue);
            }
          }
          break;
          
        case 'issuerName':
          const sellerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const sellerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (sellerNameElement) {
            invoice.sellerName = sellerNameElement.textContent?.trim() || '';
          }
          if (sellerTaxElement) {
            invoice.sellerTaxNumber = sellerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.sellerName && !invoice.sellerAddress) {
            invoice.sellerAddress = 'غير محدد';
          }
          break;
          
        case 'receiverName':
          const buyerNameElement = cell.querySelector('.griCellTitleGray, .griCellTitle');
          const buyerTaxElement = cell.querySelector('.griCellSubTitle');
          
          if (buyerNameElement) {
            invoice.buyerName = buyerNameElement.textContent?.trim() || '';
          }
          if (buyerTaxElement) {
            invoice.buyerTaxNumber = buyerTaxElement.textContent?.trim() || '';
          }
          
          if (invoice.buyerName && !invoice.buyerAddress) {
            invoice.buyerAddress = 'غير محدد';
          }
          break;
          
        case 'submission':
          const submissionLink = cell.querySelector('a.submissionId-link, a');
          if (submissionLink) {
            invoice.submissionId = submissionLink.textContent?.trim() || '';
            invoice.purchaseOrderRef = invoice.submissionId;
          }
          break;
          
        case 'status':
          const validRejectedDiv = cell.querySelector('.horizontal.valid-rejected');
          if (validRejectedDiv) {
            const validStatus = validRejectedDiv.querySelector('.status-Valid');
            const rejectedStatus = validRejectedDiv.querySelector('.status-Rejected');
            if (validStatus && rejectedStatus) {
              invoice.status = `${validStatus.textContent?.trim()} → ${rejectedStatus.textContent?.trim()}`;
            }
          } else {
            const textStatus = cell.querySelector('.textStatus, .griCellTitle, .griCellTitleGray');
            if (textStatus) {
              invoice.status = textStatus.textContent?.trim() || '';
            }
          }
          break;
      }
    });
  }
  
  extractUsingCellPositions(row, invoice) {
    const cells = row.querySelectorAll('.ms-DetailsRow-cell, td, [role="gridcell"]');
    
    if (cells.length >= 8) {
      if (!invoice.electronicNumber) {
        const firstCell = cells[0];
        const link = firstCell.querySelector('a');
        if (link) {
          invoice.electronicNumber = link.textContent?.trim() || '';
        }
      }
      
      if (!invoice.totalAmount) {
        for (let i = 2; i < Math.min(6, cells.length); i++) {
          const cellText = cells[i].textContent?.trim() || '';
          if (cellText.includes('EGP') || /^\d+[\d,]*\.?\d*$/.test(cellText.replace(/[,٬]/g, ''))) {
            invoice.totalAmount = cellText;
            invoice.totalInvoice = cellText;
            break;
          }
        }
      }
      
      if (!invoice.issueDate) {
        for (let i = 1; i < Math.min(4, cells.length); i++) {
          const cellText = cells[i].textContent?.trim() || '';
          if (cellText.includes('/') && cellText.length >= 8) {
            invoice.issueDate = cellText;
            invoice.submissionDate = cellText;
            break;
          }
        }
      }
    }
  }
  
  extractUsingTextContent(row, invoice) {
    const allText = row.textContent || '';
    
    if (!invoice.electronicNumber) {
      const electronicMatch = allText.match(/[A-Z0-9]{20,30}/);
      if (electronicMatch) {
        invoice.electronicNumber = electronicMatch[0];
      }
    }
    
    if (!invoice.issueDate) {
      const dateMatch = allText.match(/\d{1,2}\/\d{1,2}\/\d{4}/);
      if (dateMatch) {
        invoice.issueDate = dateMatch[0];
        invoice.submissionDate = dateMatch[0];
      }
    }
    
    if (!invoice.totalAmount) {
      const amountMatch = allText.match(/\d+[,٬]?\d*\.?\d*\s*EGP/);
      if (amountMatch) {
        invoice.totalAmount = amountMatch[0];
        invoice.totalInvoice = amountMatch[0];
      }
    }
  }
  
  parseAmount(amountText) {
    if (!amountText) return 0;
    const cleanText = amountText.replace(/[,٬\sEGP]/g, '').replace(/[^\d.]/g, '');
    return parseFloat(cleanText) || 0;
  }
  
  formatAmount(amount) {
    if (!amount || amount === 0) return '0';
    return amount.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  
  generateExternalLink(invoice) {
    if (!invoice.electronicNumber) return '';
    
    let shareId = '';
    if (invoice.submissionId && invoice.submissionId.length > 10) {
      shareId = invoice.submissionId;
    } else {
      shareId = invoice.electronicNumber.replace(/[^A-Z0-9]/g, '').substring(0, 26);
    }
    
    return `https://invoicing.eta.gov.eg/documents/${invoice.electronicNumber}/share/${shareId}`;
  }
  
  isValidInvoiceData(invoice) {
    return !!(invoice.electronicNumber || invoice.internalNumber || invoice.totalAmount);
  }
  
  // OPTIMIZED: Fast All Pages Data Loading
  async getAllPagesData(options = {}) {
    try {
      this.isProcessingAllPages = true;
      this.allPagesData = [];
      
      console.log(`ETA Exporter: Fast loading ALL pages. Total: ${this.totalCount} invoices`);
      
      // Method 1: Try API calls first (fastest)
      if (this.apiEndpoint && this.authHeaders) {
        const apiResult = await this.getAllPagesViaAPI(options);
        if (apiResult.success && apiResult.data.length > 0) {
          return apiResult;
        }
      }
      
      // Method 2: Parallel DOM loading (fast)
      return await this.getAllPagesViaParallelDOM(options);
      
    } catch (error) {
      console.error('ETA Exporter: Error in fast loading:', error);
      return { 
        success: false, 
        data: this.allPagesData,
        error: error.message 
      };
    } finally {
      this.isProcessingAllPages = false;
    }
  }
  
  // NEW: API-based loading (fastest method)
  async getAllPagesViaAPI(options) {
    const batchSize = 10;
    const pagePromises = [];
    
    for (let page = 1; page <= this.totalPages; page += batchSize) {
      const batch = [];
      
      for (let i = 0; i < batchSize && (page + i) <= this.totalPages; i++) {
        const currentPage = page + i;
        batch.push(this.fetchPageDataViaAPI(currentPage));
      }
      
      pagePromises.push(Promise.all(batch));
    }
    
    const results = await Promise.all(pagePromises);
    const allData = results.flat().flat();
    
    return {
      success: true,
      data: allData,
      totalProcessed: allData.length,
      expectedTotal: this.totalCount
    };
  }
  
  async fetchPageDataViaAPI(pageNumber) {
    try {
      const url = this.buildAPIUrl(pageNumber);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: this.authHeaders,
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }
      
      const data = await response.json();
      return this.parseAPIResponse(data, pageNumber);
      
    } catch (error) {
      console.warn(`Failed to fetch page ${pageNumber} via API:`, error);
      return [];
    }
  }
  
  buildAPIUrl(pageNumber) {
    const baseUrl = this.apiEndpoint.split('?')[0];
    const params = new URLSearchParams({
      page: pageNumber,
      pageSize: this.resultsPerPage,
      sortBy: 'dateTimeReceived',
      sortOrder: 'desc'
    });
    
    return `${baseUrl}?${params.toString()}`;
  }
  
  parseAPIResponse(data, pageNumber) {
    const invoices = data.items || data.documents || data.data || [];
    
    return invoices.map((item, index) => ({
      serialNumber: ((pageNumber - 1) * this.resultsPerPage) + index + 1,
      pageNumber: pageNumber,
      electronicNumber: item.uuid || item.id || '',
      internalNumber: item.internalId || '',
      documentType: item.documentType || 'فاتورة',
      documentVersion: item.documentTypeVersion || '1.0',
      status: this.parseStatus(item.status),
      issueDate: this.formatDate(item.dateTimeIssued),
      submissionDate: this.formatDate(item.dateTimeReceived),
      totalAmount: this.formatAmount(item.totalAmount),
      invoiceValue: this.formatAmount(item.totalSalesAmount),
      vatAmount: this.formatAmount(item.totalTaxableFees),
      sellerName: item.issuer?.name || '',
      sellerTaxNumber: item.issuer?.id || '',
      buyerName: item.receiver?.name || '',
      buyerTaxNumber: item.receiver?.id || '',
      invoiceCurrency: 'EGP',
      taxDiscount: '0',
      electronicSignature: 'موقع إلكترونياً',
      externalLink: this.generateExternalLink(item)
    }));
  }
  
  parseStatus(status) {
    const statusMap = {
      'Valid': 'صالح',
      'Invalid': 'غير صالح',
      'Cancelled': 'ملغي',
      'Submitted': 'مقدم',
      'Rejected': 'مرفوض'
    };
    return statusMap[status] || status || '';
  }
  
  formatDate(dateString) {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ar-EG');
    } catch {
      return dateString;
    }
  }
  
  // NEW: Parallel DOM loading (fallback method)
  async getAllPagesViaParallelDOM(options) {
    const batchSize = 5; // Load 5 pages simultaneously
    const results = [];
    
    // Always start from page 1
    await this.navigateToFirstPage();
    
    for (let startPage = 1; startPage <= this.totalPages; startPage += batchSize) {
      const endPage = Math.min(startPage + batchSize - 1, this.totalPages);
      const batchPromises = [];
      
      for (let page = startPage; page <= endPage; page++) {
        if (page === this.currentPage) {
          // Current page - extract directly
          batchPromises.push(Promise.resolve(this.getCurrentPageData(page)));
        } else {
          // Other pages - load in parallel
          batchPromises.push(this.loadPageInBackground(page));
        }
      }
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());
      
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          currentPage: endPage,
          totalPages: this.totalPages,
          message: `تم تحميل ${endPage} من ${this.totalPages} صفحة`,
          percentage: (endPage / this.totalPages) * 100
        });
      }
      
      // Small delay between batches
      if (endPage < this.totalPages) {
        await this.delay(200);
      }
    }
    
    return {
      success: true,
      data: results,
      totalProcessed: results.length,
      expectedTotal: this.totalCount
    };
  }
  
  getCurrentPageData(pageNumber) {
    this.scanForInvoices();
    return this.invoiceData.map((invoice, index) => ({
      ...invoice,
      pageNumber: pageNumber,
      serialNumber: ((pageNumber - 1) * this.resultsPerPage) + index + 1
    }));
  }
  
  async loadPageInBackground(pageNumber) {
    return new Promise((resolve) => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('page', pageNumber);
      iframe.src = currentUrl.toString();
      
      const timeout = setTimeout(() => {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        resolve([]);
      }, 8000); // 8 second timeout
      
      iframe.onload = () => {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          const data = this.extractDataFromDocument(iframeDoc, pageNumber);
          
          clearTimeout(timeout);
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          resolve(data);
        } catch (error) {
          console.warn(`Error loading page ${pageNumber}:`, error);
          clearTimeout(timeout);
          if (iframe.parentNode) {
            document.body.removeChild(iframe);
          }
          resolve([]);
        }
      };
      
      iframe.onerror = () => {
        clearTimeout(timeout);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        resolve([]);
      };
      
      document.body.appendChild(iframe);
    });
  }
  
  extractDataFromDocument(doc, pageNumber) {
    const rows = doc.querySelectorAll('.ms-DetailsRow[role="row"], .ms-List-cell[role="gridcell"]');
    const invoices = [];
    
    rows.forEach((row, index) => {
      const invoice = this.extractDataFromRow(row, index + 1);
      if (this.isValidInvoiceData(invoice)) {
        invoice.pageNumber = pageNumber;
        invoice.serialNumber = ((pageNumber - 1) * this.resultsPerPage) + index + 1;
        invoices.push(invoice);
      }
    });
    
    return invoices;
  }
  
  async navigateToFirstPage() {
    if (this.currentPage === 1) return;
    
    const pageButtons = document.querySelectorAll('button, a');
    for (const button of pageButtons) {
      const buttonText = button.textContent?.trim();
      if (buttonText === '1') {
        button.click();
        await this.delay(1000);
        await this.waitForPageLoadComplete();
        this.extractPaginationInfo();
        return;
      }
    }
  }
  
  async waitForPageLoadComplete() {
    // Wait for loading indicators to disappear
    await this.waitForCondition(() => {
      const loadingIndicators = document.querySelectorAll(
        '.LoadingIndicator, .ms-Spinner, [class*="loading"], [class*="spinner"], .ms-Shimmer'
      );
      const isLoading = Array.from(loadingIndicators).some(el => 
        el.offsetParent !== null && 
        window.getComputedStyle(el).display !== 'none'
      );
      return !isLoading;
    }, 10000); // Reduced timeout
    
    // Wait for invoice rows to appear
    await this.waitForCondition(() => {
      const rows = this.getVisibleInvoiceRows();
      return rows.length > 0;
    }, 10000); // Reduced timeout
    
    // Reduced stability wait
    await this.delay(1000);
  }
  
  async waitForCondition(condition, timeout = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      try {
        if (condition()) {
          return true;
        }
      } catch (error) {
        // Ignore errors in condition check
      }
      await this.delay(200); // Reduced delay
    }
    
    return false;
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  setProgressCallback(callback) {
    this.progressCallback = callback;
  }
  
  async getInvoiceDetails(invoiceId) {
    try {
      const details = await this.extractInvoiceDetailsFromPage(invoiceId);
      return {
        success: true,
        data: details
      };
    } catch (error) {
      console.error('Error getting invoice details:', error);
      return { 
        success: false, 
        data: [],
        error: error.message 
      };
    }
  }
  
  async extractInvoiceDetailsFromPage(invoiceId) {
    const details = [];
    
    try {
      const detailsTable = document.querySelector('.ms-DetailsList, [data-automationid="DetailsList"], table');
      
      if (detailsTable) {
        const rows = detailsTable.querySelectorAll('.ms-DetailsRow[role="row"], tr');
        
        rows.forEach((row, index) => {
          const cells = row.querySelectorAll('.ms-DetailsRow-cell, td');
          
          if (cells.length >= 6) {
            const item = {
              itemCode: this.extractCellText(cells[0]) || `ITEM-${index + 1}`,
              description: this.extractCellText(cells[1]) || 'صنف',
              unitCode: this.extractCellText(cells[2]) || 'EA',
              unitName: this.extractCellText(cells[3]) || 'قطعة',
              quantity: this.extractCellText(cells[4]) || '1',
              unitPrice: this.extractCellText(cells[5]) || '0',
              totalValue: this.extractCellText(cells[6]) || '0',
              taxAmount: this.extractCellText(cells[7]) || '0',
              vatAmount: this.extractCellText(cells[8]) || '0'
            };
            
            if (item.description && 
                item.description !== 'اسم الصنف' && 
                item.description !== 'Description' &&
                item.description.trim() !== '') {
              details.push(item);
            }
          }
        });
      }
      
      if (details.length === 0) {
        const invoice = this.invoiceData.find(inv => inv.electronicNumber === invoiceId);
        if (invoice) {
          details.push({
            itemCode: invoice.electronicNumber || 'INVOICE',
            description: 'إجمالي الفاتورة',
            unitCode: 'EA',
            unitName: 'فاتورة',
            quantity: '1',
            unitPrice: invoice.totalAmount || '0',
            totalValue: invoice.invoiceValue || invoice.totalAmount || '0',
            taxAmount: '0',
            vatAmount: invoice.vatAmount || '0'
          });
        }
      }
      
    } catch (error) {
      console.error('Error extracting invoice details:', error);
    }
    
    return details;
  }
  
  extractCellText(cell) {
    if (!cell) return '';
    
    const textElement = cell.querySelector('.griCellTitle, .griCellTitleGray, .ms-DetailsRow-cellContent') || cell;
    return textElement.textContent?.trim() || '';
  }
  
  getInvoiceData() {
    return {
      invoices: this.invoiceData,
      totalCount: this.totalCount,
      currentPage: this.currentPage,
      totalPages: this.totalPages
    };
  }
  
  cleanup() {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.rescanTimeout) {
      clearTimeout(this.rescanTimeout);
    }
  }
}

// Initialize content script
const etaContentScript = new ETAContentScript();

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('ETA Exporter: Received message:', request.action);
  
  switch (request.action) {
    case 'ping':
      sendResponse({ success: true, message: 'Content script is ready' });
      break;
      
    case 'getInvoiceData':
      const data = etaContentScript.getInvoiceData();
      console.log('ETA Exporter: Returning invoice data:', data);
      sendResponse({
        success: true,
        data: data
      });
      break;
      
    case 'getInvoiceDetails':
      etaContentScript.getInvoiceDetails(request.invoiceId)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getAllPagesData':
      if (request.options && request.options.progressCallback) {
        etaContentScript.setProgressCallback((progress) => {
          chrome.runtime.sendMessage({
            action: 'progressUpdate',
            progress: progress
          }).catch(() => {
            // Ignore errors if popup is closed
          });
        });
      }
      
      etaContentScript.getAllPagesData(request.options)
        .then(result => {
          console.log('ETA Exporter: All pages data result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('ETA Exporter: Error in getAllPagesData:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
      
    case 'rescanPage':
      etaContentScript.scanForInvoices();
      sendResponse({
        success: true,
        data: etaContentScript.getInvoiceData()
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  etaContentScript.cleanup();
});

console.log('ETA Exporter: Content script loaded successfully');