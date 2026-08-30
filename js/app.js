const currencyOne = document.getElementById('currency-one');
const amountOne = document.getElementById('amount-one');
const currencyTwo = document.getElementById('currency-two');
const amountTwo = document.getElementById('amount-two');
const swapButton = document.getElementById('swap');
const rateElement = document.getElementById('rate');
const statusElement = document.getElementById('status');

const API_URL = 'https://open.er-api.com/v6/latest/';
const CACHE_PREFIX = 'exchange-rates-';
const CACHE_DURATION = 24 * 60 * 60 * 1000;
const fallbackCurrencies = ['AED', 'ARS', 'AUD', 'BGN', 'EUR', 'JPY', 'MMK', 'THB', 'USD'];

let activeRates = null;
let requestNumber = 0;

function debounce(callback, delay = 300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => callback(...args), delay);
    };
}

function readCache(baseCurrency) {
    try {
        const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${baseCurrency}`));
        return cached && Date.now() - cached.savedAt < CACHE_DURATION ? cached.data : null;
    } catch {
        return null;
    }
}

function writeCache(baseCurrency, data) {
    try {
        localStorage.setItem(`${CACHE_PREFIX}${baseCurrency}`, JSON.stringify({ savedAt: Date.now(), data }));
    } catch {
        // Conversions still work if storage is unavailable or full.
    }
}

async function fetchRates(baseCurrency) {
    const cached = readCache(baseCurrency);
    if (cached) return cached;

    const response = await fetch(`${API_URL}${encodeURIComponent(baseCurrency)}`);
    if (!response.ok) throw new Error(`Rate service returned ${response.status}`);

    const data = await response.json();
    if (data.result !== 'success' || !data.rates || data.base_code !== baseCurrency) {
        throw new Error(data['error-type'] || 'The rate service returned invalid data');
    }

    writeCache(baseCurrency, data);
    return data;
}

function formatNumber(value) {
    if (!Number.isFinite(value)) return '';
    return Number(value.toFixed(6)).toString();
}

function formatRate(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

function showError(message) {
    statusElement.textContent = message;
    statusElement.classList.add('error');
}

function setLoading(isLoading) {
    currencyOne.disabled = isLoading;
    currencyTwo.disabled = isLoading;
    swapButton.disabled = isLoading;
    statusElement.classList.remove('error');
    statusElement.textContent = isLoading ? 'Updating rates…' : '';
}

function populateCurrencies(codes) {
    const fromSelection = currencyOne.value || 'USD';
    const toSelection = currencyTwo.value || 'EUR';
    const options = [...new Set([...codes, 'JPY'])]
        .sort()
        .map(code => `<option value="${code}">${code}</option>`)
        .join('');

    currencyOne.innerHTML = options;
    currencyTwo.innerHTML = options;
    currencyOne.value = codes.includes(fromSelection) ? fromSelection : 'USD';
    currencyTwo.value = codes.includes(toSelection) ? toSelection : 'EUR';
}

function updateRateDisplay() {
    const rate = activeRates?.rates?.[currencyTwo.value];
    if (!Number.isFinite(rate)) throw new Error(`No rate is available for ${currencyTwo.value}`);
    rateElement.textContent = `1 ${currencyOne.value} = ${formatRate(rate)} ${currencyTwo.value}`;
    return rate;
}

function convertFromSource() {
    try {
        const rate = updateRateDisplay();
        const amount = Number.parseFloat(amountOne.value);
        amountTwo.value = amountOne.value === '' ? '' : formatNumber(amount * rate);
    } catch (error) {
        showError(error.message);
    }
}

function convertFromTarget() {
    try {
        const rate = updateRateDisplay();
        const amount = Number.parseFloat(amountTwo.value);
        amountOne.value = amountTwo.value === '' ? '' : formatNumber(amount / rate);
    } catch (error) {
        showError(error.message);
    }
}

async function calculate() {
    const thisRequest = ++requestNumber;
    setLoading(true);

    try {
        const data = await fetchRates(currencyOne.value);
        if (thisRequest !== requestNumber) return;
        activeRates = data;
        populateCurrencies(Object.keys(data.rates));
        convertFromSource();
    } catch (error) {
        if (thisRequest === requestNumber) {
            rateElement.textContent = 'Rate unavailable';
            showError(`Could not update rates. ${error.message}. Please try again.`);
        }
    } finally {
        if (thisRequest === requestNumber) setLoading(false);
    }
}

const debouncedSourceConversion = debounce(convertFromSource);
const debouncedTargetConversion = debounce(convertFromTarget);

currencyOne.addEventListener('change', calculate);
currencyTwo.addEventListener('change', convertFromSource);
amountOne.addEventListener('input', debouncedSourceConversion);
amountTwo.addEventListener('input', debouncedTargetConversion);

swapButton.addEventListener('click', () => {
    [currencyOne.value, currencyTwo.value] = [currencyTwo.value, currencyOne.value];
    [amountOne.value, amountTwo.value] = [amountTwo.value, amountOne.value];
    calculate();
});

populateCurrencies(fallbackCurrencies);
calculate();
