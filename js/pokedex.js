'use strict';

const PAGE_SIZE = 24;
const POKEMON_LIST_LIMIT = 2000;

const elements = {
    themeButton: document.querySelector('#theme-button'),
    pokemonGrid: document.querySelector('#pokemon-grid'),
    pokemonTemplate: document.querySelector('#pokemon-card-template'),
    pokemonCounter: document.querySelector('#pokemon-counter'),
    searchForm: document.querySelector('#search-form'),
    searchInput: document.querySelector('#search-input'),
    typeFilter: document.querySelector('#type-filter'),
    resetButton: document.querySelector('#reset-button'),
    loadMoreButton: document.querySelector('#load-more-button'),
    statusMessage: document.querySelector('#status-message'),
    loadingArea: document.querySelector('#loading-area')
};

const state = {
    allPokemon: [],
    filteredPokemon: [],
    displayedAmount: 0,
    favorites: PokePal.getFavorites(),
    team: PokePal.getTeam(),
    isLoading: false
};

async function fetchPokemonIndex() {
    const data = await PokePal.fetchJson(
        `${PokePal.API_BASE_URL}/pokemon?limit=${POKEMON_LIST_LIMIT}&offset=0`
    );

    return data.results.map((pokemon) => {
        const urlParts = pokemon.url.split('/').filter(Boolean);
        return {
            id: Number(urlParts[urlParts.length - 1]),
            name: pokemon.name
        };
    });
}

async function populateTypeFilter() {
    const data = await PokePal.fetchJson(`${PokePal.API_BASE_URL}/type`);
    const ignoredTypes = new Set(['unknown', 'stellar', 'shadow']);

    data.results
        .filter((type) => !ignoredTypes.has(type.name))
        .sort((first, second) => first.name.localeCompare(second.name))
        .forEach((type) => {
            const option = document.createElement('option');
            option.value = type.name;
            option.textContent = PokePal.capitalize(type.name);
            elements.typeFilter.append(option);
        });
}

async function getPokemonForSelectedType(type) {
    if (type === 'all') {
        return state.allPokemon;
    }

    const data = await PokePal.fetchJson(`${PokePal.API_BASE_URL}/type/${type}`);
    const allowedIds = new Set(
        data.pokemon.map((entry) => {
            const parts = entry.pokemon.url.split('/').filter(Boolean);
            return Number(parts[parts.length - 1]);
        })
    );

    return state.allPokemon.filter((pokemon) => allowedIds.has(pokemon.id));
}

async function applyFilters() {
    const searchText = elements.searchInput.value.trim().toLowerCase();
    const selectedType = elements.typeFilter.value;

    setLoading(true, 'Filtering Pokémon...');

    try {
        const pokemonForType = await getPokemonForSelectedType(selectedType);

        state.filteredPokemon = pokemonForType.filter((pokemon) => {
            const matchesName = pokemon.name.includes(searchText);
            const matchesNumber = String(pokemon.id) === searchText.replace(/^#/, '');
            return searchText === '' || matchesName || matchesNumber;
        });

        state.displayedAmount = 0;
        elements.pokemonGrid.replaceChildren();
        elements.statusMessage.textContent =
            state.filteredPokemon.length === 0 ? 'No Pokémon matched your search.' : '';

        setLoading(false);

        if (state.filteredPokemon.length > 0) {
            await loadNextPage();
        } else {
            updateInterface();
        }
    } catch (error) {
        console.error(error);
        setLoading(false);
        elements.statusMessage.textContent = 'The filter could not be applied.';
    }
}

async function loadNextPage() {
    if (state.isLoading) {
        return;
    }

    const nextEntries = state.filteredPokemon.slice(
        state.displayedAmount,
        state.displayedAmount + PAGE_SIZE
    );

    if (nextEntries.length === 0) {
        updateInterface();
        return;
    }

    setLoading(true, 'Loading more Pokémon...');

    try {
        const pokemonDetails = await Promise.all(
            nextEntries.map((entry) => PokePal.fetchPokemonById(entry.id))
        );

        pokemonDetails.forEach(createPokemonCard);
        state.displayedAmount += pokemonDetails.length;
        updateInterface();
    } catch (error) {
        console.error(error);
        elements.statusMessage.textContent = 'Pokémon could not be loaded. Please try again.';
    } finally {
        setLoading(false);
    }
}

function createPokemonCard(pokemon) {
    const fragment = elements.pokemonTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.pokemon-card');
    const image = fragment.querySelector('.pokemon-image');
    const favoriteButton = fragment.querySelector('.favorite-button');
    const teamButton = fragment.querySelector('.team-button');
    const typeList = fragment.querySelector('.type-list');

    card.dataset.pokemonId = pokemon.id;
    fragment.querySelector('.pokemon-number').textContent =
        PokePal.formatPokemonNumber(pokemon.id);

    image.src = pokemon.image;
    image.alt = `${PokePal.capitalize(pokemon.name)}, a ${pokemon.types
        .map(PokePal.capitalize)
        .join(' and ')} type Pokémon`;

    fragment.querySelector('.pokemon-name').textContent =
        PokePal.capitalize(pokemon.name);
    fragment.querySelector('.pokemon-height').textContent =
        `${pokemon.height.toFixed(1)} m`;
    fragment.querySelector('.pokemon-weight').textContent =
        `${pokemon.weight.toFixed(1)} kg`;

    pokemon.types.forEach((type) => typeList.append(PokePal.createTypeChip(type)));

    updateFavoriteButton(favoriteButton, pokemon.id);
    updateTeamButton(teamButton, pokemon.id);

    favoriteButton.addEventListener('click', () => toggleFavorite(pokemon.id));
    teamButton.addEventListener('click', () => toggleTeamMember(pokemon.id));

    elements.pokemonGrid.append(fragment);
}

function toggleFavorite(pokemonId) {
    if (state.favorites.includes(pokemonId)) {
        state.favorites = state.favorites.filter((id) => id !== pokemonId);
        showTemporaryStatus('Removed from favorites.');
    } else {
        state.favorites.push(pokemonId);
        showTemporaryStatus('Added to favorites!');
    }

    PokePal.saveFavorites(state.favorites);
    refreshCardButtons();
}

function toggleTeamMember(pokemonId) {
    if (state.team.includes(pokemonId)) {
        state.team = state.team.filter((id) => id !== pokemonId);
        showTemporaryStatus('Removed from your team.');
    } else if (state.team.length >= 6) {
        showTemporaryStatus('Your team is full. Remove a Pokémon first.');
        return;
    } else {
        state.team.push(pokemonId);
        showTemporaryStatus('Added to your team!');
    }

    PokePal.saveTeam(state.team);
    refreshCardButtons();
}

function updateFavoriteButton(button, pokemonId) {
    const isFavorite = state.favorites.includes(pokemonId);
    button.textContent = isFavorite ? '♥' : '♡';
    button.classList.toggle('is-favorite', isFavorite);
    button.setAttribute('aria-pressed', String(isFavorite));
    button.setAttribute('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites');
}

function updateTeamButton(button, pokemonId) {
    const isInTeam = state.team.includes(pokemonId);
    button.textContent = isInTeam ? 'Remove from team' : 'Add to team';
    button.classList.toggle('secondary-button', isInTeam);
    button.classList.toggle('primary-button', !isInTeam);
}

function refreshCardButtons() {
    document.querySelectorAll('.pokemon-card').forEach((card) => {
        const pokemonId = Number(card.dataset.pokemonId);
        updateFavoriteButton(card.querySelector('.favorite-button'), pokemonId);
        updateTeamButton(card.querySelector('.team-button'), pokemonId);
    });
}

function updateInterface() {
    const visibleAmount = Math.min(state.displayedAmount, state.filteredPokemon.length);
    elements.pokemonCounter.textContent = `${visibleAmount} of ${state.filteredPokemon.length}`;
    elements.loadMoreButton.hidden =
        state.displayedAmount >= state.filteredPokemon.length ||
        state.filteredPokemon.length === 0;
}

function setLoading(isLoading, message = 'Loading Pokémon...') {
    state.isLoading = isLoading;
    elements.loadingArea.hidden = !isLoading;
    elements.loadingArea.setAttribute('aria-busy', String(isLoading));
    elements.loadingArea.querySelector('p').textContent = message;
    elements.loadMoreButton.disabled = isLoading;
}

function showTemporaryStatus(message) {
    elements.statusMessage.textContent = message;

    window.setTimeout(() => {
        if (elements.statusMessage.textContent === message) {
            elements.statusMessage.textContent = '';
        }
    }, 2500);
}

function resetFilters() {
    elements.searchInput.value = '';
    elements.typeFilter.value = 'all';
    state.filteredPokemon = [...state.allPokemon];
    state.displayedAmount = 0;
    elements.pokemonGrid.replaceChildren();
    elements.statusMessage.textContent = '';
    loadNextPage();
}

elements.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    applyFilters();
});

elements.typeFilter.addEventListener('change', applyFilters);
elements.resetButton.addEventListener('click', resetFilters);
elements.loadMoreButton.addEventListener('click', loadNextPage);
elements.themeButton.addEventListener('click', () => {
    PokePal.toggleTheme(elements.themeButton);
});

async function initializePokedex() {
    PokePal.loadTheme(elements.themeButton);
    setLoading(true, 'Preparing the Pokédex...');

    try {
        const [pokemonIndex] = await Promise.all([
            fetchPokemonIndex(),
            populateTypeFilter()
        ]);

        state.allPokemon = pokemonIndex;
        state.filteredPokemon = [...pokemonIndex];
        setLoading(false);
        await loadNextPage();
    } catch (error) {
        console.error(error);
        setLoading(false);
        elements.statusMessage.textContent =
            'The Pokédex could not connect to PokéAPI. Check your internet connection and reload the page.';
        elements.pokemonCounter.textContent = 'Unavailable';
    }
}

initializePokedex();
