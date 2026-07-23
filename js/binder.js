'use strict';

const TCG_API_URL = 'https://api.pokemontcg.io/v2/cards';

const BINDER_STORAGE_KEY = 'pinkPokepalVirtualBinder';

const CARDS_PER_PAGE = 9;
const SEARCH_RESULT_LIMIT = 24;

const elements = {
    themeButton: document.querySelector('#theme-button'),
    binderName: document.querySelector('#binder-name'),
    addPageButton: document.querySelector('#add-page-button'),
    clearBinderButton: document.querySelector('#clear-binder-button'),

    pageValue: document.querySelector('#page-value'),
    binderValue: document.querySelector('#binder-value'),
    cardCount: document.querySelector('#card-count'),

    previousPageButton: document.querySelector('#previous-page-button'),
    nextPageButton: document.querySelector('#next-page-button'),
    deletePageButton: document.querySelector('#delete-page-button'),
    pageIndicator: document.querySelector('#page-indicator'),

    binderStatus: document.querySelector('#binder-status'),
    binderPage: document.querySelector('#binder-page'),

    searchForm: document.querySelector('#card-search-form'),
    searchInput: document.querySelector('#card-search-input'),
    setFilter: document.querySelector('#card-set-filter'),
    numberFilter: document.querySelector('#card-number-filter'),
    rarityFilter: document.querySelector('#card-rarity-filter'),
    sortFilter: document.querySelector('#card-sort-filter'),
    resetSearchButton: document.querySelector('#reset-search-button'),
    searchStatus: document.querySelector('#search-status'),
    searchCount: document.querySelector('#search-count'),
    searchResults: document.querySelector('#search-results'),
    searchPagination: document.querySelector('#search-pagination'),
    searchPreviousButton: document.querySelector('#search-previous-button'),
    searchNextButton: document.querySelector('#search-next-button'),
    searchPageIndicator: document.querySelector('#search-page-indicator'),
    cardModal: document.querySelector('#card-modal'),
    cardModalClose: document.querySelector('#card-modal-close'),
    cardModalImage: document.querySelector('#card-modal-image'),
    cardModalTitle: document.querySelector('#card-modal-title'),
    cardModalSet: document.querySelector('#card-modal-set'),
    cardModalNumber: document.querySelector('#card-modal-number'),
    cardModalRarity: document.querySelector('#card-modal-rarity'),
    cardModalHp: document.querySelector('#card-modal-hp'),
    cardModalType: document.querySelector('#card-modal-type'),
    cardModalArtist: document.querySelector('#card-modal-artist'),
    cardModalRelease: document.querySelector('#card-modal-release'),
    cardModalPrice: document.querySelector('#card-modal-price'),
    cardModalFlavor: document.querySelector('#card-modal-flavor')
};

function createEmptyPage() {
    return Array(CARDS_PER_PAGE).fill(null);
}

const defaultBinder = {
    name: 'My Pokémon Binder',
    currentPage: 0,
    pages: [
        createEmptyPage()
    ]
};

let binder = loadBinder();

const searchState = {
    page: 1,
    totalCount: 0,
    totalPages: 0,
    query: '',
    orderBy: '-set.releaseDate',
    loading: false
};

const searchCache = new Map();
let activeSearchController = null;

function cloneDefaultBinder() {
    return JSON.parse(JSON.stringify(defaultBinder));
}

function loadBinder() {
    const savedBinder = localStorage.getItem(BINDER_STORAGE_KEY);

    if (!savedBinder) {
        return cloneDefaultBinder();
    }

    try {
        const parsedBinder = JSON.parse(savedBinder);

        if (
            !parsedBinder ||
            !Array.isArray(parsedBinder.pages) ||
            parsedBinder.pages.length === 0
        ) {
            return cloneDefaultBinder();
        }

        parsedBinder.pages = parsedBinder.pages.map((page) => {
            const repairedPage = Array.isArray(page)
                ? page.slice(0, CARDS_PER_PAGE)
                : [];

            while (repairedPage.length < CARDS_PER_PAGE) {
                repairedPage.push(null);
            }

            /*
                Repair cards saved by the older binder version.
            */
            return repairedPage.map((card) => {
                if (!card) {
                    return null;
                }

                return {
                    ...card,
                    imageLarge: card.imageLarge || card.image || '',
                    setReleaseDate: card.setReleaseDate || '',
                    setPrintedTotal: Number(card.setPrintedTotal) || 0,
                    rarity: card.rarity || 'Unknown rarity',
                    hp: card.hp || '',
                    types: Array.isArray(card.types) ? card.types : [],
                    artist: card.artist || '',
                    flavorText: card.flavorText || '',
                    prices: {
                        ungraded: Number(card.prices?.ungraded) || 0
                    }
                };
            });
        });

        parsedBinder.currentPage = Math.min(
            Math.max(Number(parsedBinder.currentPage) || 0, 0),
            parsedBinder.pages.length - 1
        );

        return {
            ...cloneDefaultBinder(),
            ...parsedBinder
        };
    } catch (error) {
        console.error('Could not read the saved binder:', error);
        return cloneDefaultBinder();
    }
}

function saveBinder() {
    localStorage.setItem(
        BINDER_STORAGE_KEY,
        JSON.stringify(binder)
    );
}

function formatMoney(value) {
    return new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: 'EUR'
    }).format(Number(value) || 0);
}

function escapeQueryValue(value) {
    return value
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"');
}

function parseCardNumberFilter(value) {
    const normalizedValue = value.trim().replaceAll(' ', '');

    if (!normalizedValue) return [];

    const slashParts = normalizedValue.split('/');

    if (slashParts.length === 2) {
        const [cardNumber, printedTotal] = slashParts;

        if (!cardNumber || !/^\d+$/.test(printedTotal)) {
            throw new Error('Use a number like 152/142, or a promo code like SWSH001.');
        }

        return [
            `number:"${escapeQueryValue(cardNumber)}"`,
            `set.printedTotal:${printedTotal}`
        ];
    }

    if (slashParts.length > 2) {
        throw new Error('Use a number like 152/142, or a promo code like SWSH001.');
    }

    return [`number:"${escapeQueryValue(normalizedValue)}"`];
}

function buildCardQuery() {
    const queryParts = [];
    const name = elements.searchInput.value.trim();
    const setName = elements.setFilter.value.trim();
    const cardNumber = elements.numberFilter.value;
    const rarity = elements.rarityFilter.value;

    if (name) queryParts.push(`name:"${escapeQueryValue(name)}*"`);
    if (setName) queryParts.push(`set.name:"${escapeQueryValue(setName)}*"`);

    queryParts.push(...parseCardNumberFilter(cardNumber));

    if (rarity) queryParts.push(`rarity:"${escapeQueryValue(rarity)}"`);

    return queryParts.join(' ');
}

function getSearchCacheKey(query, page, orderBy) {
    return `${query}|${page}|${orderBy}`;
}

async function searchCards(query, page, orderBy) {
    const cacheKey = getSearchCacheKey(query, page, orderBy);

    if (searchCache.has(cacheKey)) {
        return searchCache.get(cacheKey);
    }

    if (activeSearchController) {
        activeSearchController.abort();
    }

    activeSearchController = new AbortController();

    const parameters = new URLSearchParams({
        q: query,
        page: String(page),
        pageSize: String(SEARCH_RESULT_LIMIT),
        orderBy
    });

    const response = await fetch(
        `${TCG_API_URL}?${parameters.toString()}`,
        { signal: activeSearchController.signal }
    );

    if (!response.ok) {
        throw new Error(
            `Card search failed with status ${response.status}.`
        );
    }

    const result = await response.json();
    searchCache.set(cacheKey, result);
    return result;
}

function getUngradedValue(card) {
    return Number(
        card.cardmarket?.prices?.trendPrice ??
        card.cardmarket?.prices?.averageSellPrice ??
        card.cardmarket?.prices?.avg7 ??
        0
    );
}

function createStoredCard(apiCard) {
    return {
        id: apiCard.id,
        name: apiCard.name,
        number: apiCard.number,
        rarity: apiCard.rarity || 'Unknown rarity',
        setName: apiCard.set?.name || 'Unknown set',
        setId: apiCard.set?.id || '',
        setReleaseDate: apiCard.set?.releaseDate || '',
        setPrintedTotal: Number(apiCard.set?.printedTotal) || 0,
        image: apiCard.images?.small || apiCard.images?.large || '',
        imageLarge: apiCard.images?.large || apiCard.images?.small || '',
        hp: apiCard.hp || '',
        types: Array.isArray(apiCard.types) ? apiCard.types : [],
        artist: apiCard.artist || '',
        flavorText: apiCard.flavorText || '',
        cardmarketUrl: apiCard.cardmarket?.url || '',
        prices: {
            ungraded: getUngradedValue(apiCard)
        }
    };
}

function getCardValue(card) {
    return Number(card?.prices?.ungraded) || 0;
}

function calculatePageValue(page) {
    return page.reduce(
        (total, card) => total + getCardValue(card),
        0
    );
}

function calculateBinderValue() {
    return binder.pages.reduce(
        (binderTotal, page) =>
            binderTotal + calculatePageValue(page),
        0
    );
}

function countCards() {
    return binder.pages.reduce(
        (total, page) =>
            total + page.filter(Boolean).length,
        0
    );
}

function findFirstEmptySlot() {
    for (
        let pageIndex = 0;
        pageIndex < binder.pages.length;
        pageIndex += 1
    ) {
        const slotIndex = binder.pages[pageIndex].findIndex(
            (card) => card === null
        );

        if (slotIndex !== -1) {
            return {
                pageIndex,
                slotIndex
            };
        }
    }

    return null;
}

function addCardToBinder(apiCard) {
    let emptyPosition = findFirstEmptySlot();

    if (!emptyPosition) {
        binder.pages.push(createEmptyPage());

        emptyPosition = {
            pageIndex: binder.pages.length - 1,
            slotIndex: 0
        };
    }

    const storedCard = createStoredCard(apiCard);

    binder.pages[emptyPosition.pageIndex][emptyPosition.slotIndex] =
        storedCard;

    binder.currentPage = emptyPosition.pageIndex;

    saveBinder();
    renderBinder();

    showTemporaryMessage(
        elements.binderStatus,
        `${apiCard.name} was added to page ${binder.currentPage + 1}.`
    );

    elements.binderPage.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

function removeCard(slotIndex) {
    const card = binder.pages[binder.currentPage][slotIndex];

    if (!card) {
        return;
    }

    binder.pages[binder.currentPage][slotIndex] = null;

    saveBinder();
    renderBinder();

    showTemporaryMessage(
        elements.binderStatus,
        `${card.name} was removed from the binder.`
    );
}


function formatReleaseDate(dateValue) {
    if (!dateValue) return '—';
    const date = new Date(dateValue.replaceAll('/', '-'));
    if (Number.isNaN(date.getTime())) return dateValue;
    return new Intl.DateTimeFormat('en-GB', {
        year: 'numeric', month: 'long', day: 'numeric'
    }).format(date);
}

function openCardModal(card) {
    if (!card || !elements.cardModal) return;
    elements.cardModalImage.src = card.imageLarge || card.image || '';
    elements.cardModalImage.alt = card.name || 'Pokémon card';
    elements.cardModalTitle.textContent = card.name || 'Pokémon card';
    elements.cardModalSet.textContent = card.setName || '—';
    elements.cardModalNumber.textContent = formatPrintedCardNumber(card);
    elements.cardModalRarity.textContent = card.rarity || '—';
    elements.cardModalHp.textContent = card.hp || '—';
    elements.cardModalType.textContent = card.types?.length ? card.types.join(', ') : '—';
    elements.cardModalArtist.textContent = card.artist || '—';
    elements.cardModalRelease.textContent = formatReleaseDate(card.setReleaseDate);
    elements.cardModalPrice.textContent = formatMoney(getCardValue(card));
    elements.cardModalFlavor.textContent = card.flavorText || '';
    elements.cardModalFlavor.hidden = !card.flavorText;
    elements.cardModal.classList.add('is-open');
    elements.cardModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    elements.cardModalClose.focus();
}

function closeCardModal() {
    if (!elements.cardModal) return;
    elements.cardModal.classList.remove('is-open');
    elements.cardModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
}

function moveCardOneStep(slotIndex, direction) {
    const page = binder.pages[binder.currentPage];
    const destinationIndex = slotIndex + direction;

    if (
        destinationIndex < 0 ||
        destinationIndex >= CARDS_PER_PAGE
    ) {
        return;
    }

    [page[slotIndex], page[destinationIndex]] =
        [page[destinationIndex], page[slotIndex]];

    saveBinder();
    renderBinder();
}

function createEmptySlot(slotIndex) {
    const slot = document.createElement('div');
    slot.className = 'binder-slot is-empty';

    slot.setAttribute(
        'aria-label',
        `Empty binder pocket ${slotIndex + 1}`
    );

    const number = document.createElement('span');
    number.className = 'binder-slot-number';
    number.textContent = slotIndex + 1;

    slot.append(number);
    return slot;
}

function createFilledSlot(card, slotIndex) {
    const slot = document.createElement('article');
    slot.className = 'binder-slot';

    const wrapper = document.createElement('div');
    wrapper.className = 'binder-card';

    const image = document.createElement('img');
    image.src = card.image;
    image.alt =
        `${card.name}, ${card.setName}, card number ${card.number}`;
    image.loading = 'lazy';
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.title = 'Open card details';

    image.addEventListener('click', () => {
        openCardModal(card);
    });

    image.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openCardModal(card);
        }
    });

    const actions = document.createElement('div');
    actions.className = 'binder-card-actions';

    const leftButton = document.createElement('button');
    leftButton.type = 'button';
    leftButton.className = 'tiny-button move-left';
    leftButton.textContent = '←';
    leftButton.title = 'Move one slot left';
    leftButton.setAttribute('aria-label', 'Move card one slot left');
    leftButton.disabled = slotIndex === 0;

    leftButton.addEventListener('click', (event) => {
        event.stopPropagation();
        moveCardOneStep(slotIndex, -1);
    });

    const rightButton = document.createElement('button');
    rightButton.type = 'button';
    rightButton.className = 'tiny-button move-right';
    rightButton.textContent = '→';
    rightButton.title = 'Move one slot right';
    rightButton.setAttribute('aria-label', 'Move card one slot right');
    rightButton.disabled = slotIndex === CARDS_PER_PAGE - 1;

    rightButton.addEventListener('click', (event) => {
        event.stopPropagation();
        moveCardOneStep(slotIndex, 1);
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tiny-button remove-card';
    removeButton.textContent = '✕';
    removeButton.title = 'Remove card';
    removeButton.setAttribute('aria-label', 'Remove card from binder');

    removeButton.addEventListener('click', (event) => {
        event.stopPropagation();
        removeCard(slotIndex);
    });

    actions.append(
        leftButton,
        rightButton,
        removeButton
    );

    wrapper.append(image);
    slot.append(wrapper, actions);

    return slot;
}

function renderBinderPage() {
    elements.binderPage.replaceChildren();

    const currentPage = binder.pages[binder.currentPage];

    currentPage.forEach((card, slotIndex) => {
        elements.binderPage.append(
            card
                ? createFilledSlot(card, slotIndex)
                : createEmptySlot(slotIndex)
        );
    });
}

function updateValues() {
    const currentPage = binder.pages[binder.currentPage];

    elements.pageValue.textContent =
        formatMoney(calculatePageValue(currentPage));

    elements.binderValue.textContent =
        formatMoney(calculateBinderValue());

    const totalCards = countCards();

    elements.cardCount.textContent =
        `${totalCards} ${totalCards === 1 ? 'card' : 'cards'}`;
}

function updatePageNavigation() {
    elements.pageIndicator.textContent =
        `Page ${binder.currentPage + 1} of ${binder.pages.length}`;

    elements.previousPageButton.disabled =
        binder.currentPage === 0;

    elements.nextPageButton.disabled =
        binder.currentPage === binder.pages.length - 1;

    elements.deletePageButton.disabled =
        binder.pages.length === 1;
}

function renderBinder() {
    elements.binderName.value = binder.name;

    renderBinderPage();
    updateValues();
    updatePageNavigation();
}

function formatPrintedCardNumber(card) {
    const number = card?.number || '—';
    const printedTotal = Number(card?.set?.printedTotal ?? card?.setPrintedTotal);

    if (!printedTotal || /[a-z]/i.test(number)) return number;

    return `${number}/${printedTotal}`;
}

function createSearchResultCard(apiCard) {
    const article = document.createElement('article');
    article.className = 'search-result-card';

    const image = document.createElement('img');
    image.src = apiCard.images?.small || apiCard.images?.large || '';
    image.alt =
        `${apiCard.name}, ${apiCard.set?.name || 'unknown set'}`;
    image.loading = 'lazy';

    const heading = document.createElement('h3');
    heading.textContent = apiCard.name;

    const set = document.createElement('p');
    set.textContent =
        `${apiCard.set?.name || 'Unknown set'} · ${formatPrintedCardNumber(apiCard)}`;

    const rarity = document.createElement('p');
    rarity.textContent = apiCard.rarity || 'Unknown rarity';

    const price = document.createElement('p');
    const ungradedValue = getUngradedValue(apiCard);

    price.textContent = ungradedValue > 0
        ? `Ungraded trend: ${formatMoney(ungradedValue)}`
        : 'Ungraded price unavailable';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary-button';
    button.textContent = 'Add to binder';

    button.addEventListener('click', () => {
        addCardToBinder(apiCard);
    });

    article.append(
        image,
        heading,
        set,
        rarity,
        price,
        button
    );

    return article;
}

async function loadSearchPage({ scrollToResults = false } = {}) {
    if (!searchState.query || searchState.loading) {
        return;
    }

    searchState.loading = true;
    elements.searchStatus.textContent = 'Searching cards...';
    elements.searchCount.textContent = '';
    elements.searchResults.replaceChildren();
    elements.searchPagination.hidden = true;

    try {
        const result = await searchCards(
            searchState.query,
            searchState.page,
            searchState.orderBy
        );

        const cards = result.data || [];
        searchState.totalCount = Number(result.totalCount) || 0;
        searchState.totalPages = Math.max(
            1,
            Math.ceil(searchState.totalCount / SEARCH_RESULT_LIMIT)
        );

        if (cards.length === 0) {
            elements.searchStatus.textContent =
                'No matching cards were found.';
            return;
        }

        const fragment = document.createDocumentFragment();

        cards.forEach((card) => {
            fragment.append(createSearchResultCard(card));
        });

        elements.searchResults.append(fragment);
        elements.searchStatus.textContent = '';

        const firstResultNumber =
            ((searchState.page - 1) * SEARCH_RESULT_LIMIT) + 1;
        const lastResultNumber =
            firstResultNumber + cards.length - 1;

        elements.searchCount.textContent =
            `Showing ${firstResultNumber}–${lastResultNumber} of ` +
            `${searchState.totalCount} matching cards.`;

        elements.searchPageIndicator.textContent =
            `Page ${searchState.page} of ${searchState.totalPages}`;

        elements.searchPreviousButton.disabled =
            searchState.page <= 1;

        elements.searchNextButton.disabled =
            searchState.page >= searchState.totalPages;

        elements.searchPagination.hidden =
            searchState.totalPages <= 1;

        if (scrollToResults) {
            elements.searchResults.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            return;
        }

        console.error(error);
        elements.searchStatus.textContent =
            'Cards could not be loaded. Check your internet connection and try again.';
    } finally {
        searchState.loading = false;
    }
}

async function handleCardSearch(event) {
    event.preventDefault();

    let query;

    try {
        query = buildCardQuery();
    } catch (error) {
        elements.searchStatus.textContent = error.message;
        elements.searchCount.textContent = '';
        return;
    }

    if (!query) {
        elements.searchStatus.textContent =
            'Enter a card name, card number, promo number or choose a filter.';
        elements.searchCount.textContent = '';
        return;
    }

    searchState.page = 1;
    searchState.query = query;
    searchState.orderBy = elements.sortFilter.value;

    await loadSearchPage();
}

function resetCardSearch() {
    elements.searchForm.reset();
    searchState.page = 1;
    searchState.totalCount = 0;
    searchState.totalPages = 0;
    searchState.query = '';
    searchState.orderBy = '-set.releaseDate';

    if (activeSearchController) {
        activeSearchController.abort();
        activeSearchController = null;
    }

    elements.searchStatus.textContent = '';
    elements.searchCount.textContent = '';
    elements.searchResults.replaceChildren();
    elements.searchPagination.hidden = true;
    elements.searchInput.focus();
}

function addPage() {
    binder.pages.push(createEmptyPage());
    binder.currentPage = binder.pages.length - 1;

    saveBinder();
    renderBinder();
}

function deleteCurrentPage() {
    if (binder.pages.length === 1) {
        return;
    }

    const pageHasCards =
        binder.pages[binder.currentPage].some(Boolean);

    if (
        pageHasCards &&
        !window.confirm(
            'This page contains cards. Delete the page anyway?'
        )
    ) {
        return;
    }

    binder.pages.splice(binder.currentPage, 1);

    binder.currentPage = Math.min(
        binder.currentPage,
        binder.pages.length - 1
    );

    saveBinder();
    renderBinder();
}

function clearBinder() {
    if (
        !window.confirm(
            'Remove every card and page from this virtual binder?'
        )
    ) {
        return;
    }

    binder = cloneDefaultBinder();

    saveBinder();
    renderBinder();

    resetCardSearch();
}

function showTemporaryMessage(element, message) {
    element.textContent = message;

    window.setTimeout(() => {
        if (element.textContent === message) {
            element.textContent = '';
        }
    }, 3500);
}

elements.themeButton.addEventListener('click', () => {
    PokePal.toggleTheme(elements.themeButton);
});

elements.searchForm.addEventListener(
    'submit',
    handleCardSearch
);


elements.resetSearchButton.addEventListener(
    'click',
    resetCardSearch
);

elements.searchPreviousButton.addEventListener('click', async () => {
    if (searchState.page > 1) {
        searchState.page -= 1;
        await loadSearchPage({ scrollToResults: true });
    }
});

elements.searchNextButton.addEventListener('click', async () => {
    if (searchState.page < searchState.totalPages) {
        searchState.page += 1;
        await loadSearchPage({ scrollToResults: true });
    }
});



elements.addPageButton.addEventListener(
    'click',
    addPage
);

elements.deletePageButton.addEventListener(
    'click',
    deleteCurrentPage
);

elements.clearBinderButton.addEventListener(
    'click',
    clearBinder
);

elements.previousPageButton.addEventListener('click', () => {
    if (binder.currentPage > 0) {
        binder.currentPage -= 1;
        saveBinder();
        renderBinder();
    }
});

elements.nextPageButton.addEventListener('click', () => {
    if (binder.currentPage < binder.pages.length - 1) {
        binder.currentPage += 1;
        saveBinder();
        renderBinder();
    }
});

elements.binderName.addEventListener('input', () => {
    binder.name =
        elements.binderName.value.trim() ||
        'My Pokémon Binder';

    saveBinder();
});




if (elements.cardModalClose) {
    elements.cardModalClose.addEventListener('click', closeCardModal);
}

if (elements.cardModal) {
    elements.cardModal.addEventListener('click', (event) => {
        if (event.target.matches('[data-close-modal]')) closeCardModal();
    });
}

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.cardModal?.classList.contains('is-open')) {
        closeCardModal();
    }
});

function initializeBinder() {
    PokePal.loadTheme(elements.themeButton);

    renderBinder();
}

initializeBinder();
