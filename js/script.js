'use strict';

const elements = {
    themeButton: document.querySelector('#theme-button'),
    featuredCard: document.querySelector('#featured-card'),
    featuredImage: document.querySelector('#featured-image'),
    featuredCaption: document.querySelector('#featured-caption'),
    featuredLoader: document.querySelector('#featured-loader'),
    favoritesGrid: document.querySelector('#favorites-grid'),
    favoriteCount: document.querySelector('#favorite-count'),
    favoritesStatus: document.querySelector('#favorites-status'),
    teamGrid: document.querySelector('#team-grid'),
    teamCount: document.querySelector('#team-count'),
    teamStatus: document.querySelector('#team-status'),
    clearTeamButton: document.querySelector('#clear-team-button')
};


const state = {
    favorites: PokePal.getFavorites(),
    team: PokePal.getTeam(),
    featuredTimer: null,
    featuredPokemonId: null

};


function createCollectionCard(pokemon, collection) {
    const article = document.createElement('article');
    article.className = 'mini-card';

    const image = document.createElement('img');
    image.src = pokemon.image;
    image.alt = pokemon.name;
    image.width = 110;
    image.height = 110;
    image.loading = 'lazy';

    const heading = document.createElement('h3');
    heading.textContent = PokePal.capitalize(pokemon.name);

    const number = document.createElement('p');
    number.className = 'mini-number';
    number.textContent = PokePal.formatPokemonNumber(pokemon.id);

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-button';
    removeButton.textContent = 'Remove';

    removeButton.addEventListener('click', () => {
        if (collection === 'favorites') {
            state.favorites = state.favorites.filter((id) => id !== pokemon.id);
            PokePal.saveFavorites(state.favorites);
            renderFavorites();
        } else {
            state.team = state.team.filter((id) => id !== pokemon.id);
            PokePal.saveTeam(state.team);
            renderTeam();
        }
    });

    article.append(image, heading, number, removeButton);
    return article;
}

function createEmptyMessage(text) {
    const paragraph = document.createElement('p');
    paragraph.className = 'empty-message';
    paragraph.textContent = text;
    return paragraph;
}

async function renderFavorites() {
    elements.favoritesGrid.replaceChildren();
    elements.favoriteCount.textContent = state.favorites.length;

    if (state.favorites.length === 0) {
        elements.favoritesGrid.append(
            createEmptyMessage('You have no favorites yet. Visit the Pokédex and tap a heart.')
        );
        return;
    }

    elements.favoritesStatus.textContent = 'Loading favorites...';

    try {
        const pokemon = await Promise.all(
            state.favorites.map((id) => PokePal.fetchPokemonById(id))
        );

        pokemon.forEach((entry) => {
            elements.favoritesGrid.append(createCollectionCard(entry, 'favorites'));
        });

        elements.favoritesStatus.textContent = '';
    } catch (error) {
        console.error(error);
        elements.favoritesStatus.textContent = 'Favorites could not be loaded.';
    }
}

async function renderTeam() {
    elements.teamGrid.replaceChildren();
    elements.teamCount.textContent = `${state.team.length} / 6`;
    elements.clearTeamButton.disabled = state.team.length === 0;

    try {
        const pokemon = await Promise.all(
            state.team.map((id) => PokePal.fetchPokemonById(id))
        );

        pokemon.forEach((entry) => {
            elements.teamGrid.append(createCollectionCard(entry, 'team'));
        });

        for (let index = state.team.length; index < 6; index += 1) {
            const slot = document.createElement('div');
            slot.className = 'team-slot empty-team-slot';
            slot.innerHTML = '<span aria-hidden="true">✦</span><p>Empty slot</p>';
            elements.teamGrid.append(slot);
        }

        elements.teamStatus.textContent = '';
    } catch (error) {
        console.error(error);
        elements.teamStatus.textContent = 'Your team could not be loaded.';
    }
}

function getRandomPokemonId() {
    let randomId;

    do {
        randomId = Math.floor(Math.random() * 1025) + 1;
    } while (randomId === state.featuredPokemonId);

    state.featuredPokemonId = randomId;

    return randomId;
}

async function showFeaturedPokemon() {
    const id = getRandomPokemonId();
    elements.featuredLoader.hidden = false;
    elements.featuredImage.hidden = true;

    try {
        const pokemon = await PokePal.fetchPokemonById(id);
        elements.featuredImage.src = pokemon.image;
        elements.featuredImage.alt = `Featured Pokémon: ${PokePal.capitalize(pokemon.name)}`;
        elements.featuredCaption.textContent =
            `${PokePal.capitalize(pokemon.name)} ${PokePal.formatPokemonNumber(pokemon.id)}`;
        elements.featuredImage.hidden = false;
    } catch (error) {
        console.error(error);
        elements.featuredCaption.textContent = 'The featured Pokémon could not be loaded.';
    } finally {
        elements.featuredLoader.hidden = true;
    }
}

function startSlideshow() {
    stopSlideshow();

    state.featuredTimer = window.setInterval(() => {
        showFeaturedPokemon();
    }, 4000);
}

function stopSlideshow() {
    if (state.featuredTimer !== null) {
        window.clearInterval(state.featuredTimer);
        state.featuredTimer = null;
    }
}

elements.themeButton.addEventListener('click', () => {
    PokePal.toggleTheme(elements.themeButton);
});

elements.clearTeamButton.addEventListener('click', () => {
    state.team = [];
    PokePal.saveTeam(state.team);
    renderTeam();
});

elements.featuredCard.addEventListener('mouseenter', stopSlideshow);
elements.featuredCard.addEventListener('mouseleave', startSlideshow);

async function initializeHomePage() {
    PokePal.loadTheme(elements.themeButton);
    await Promise.all([renderFavorites(), renderTeam(), showFeaturedPokemon()]);
    startSlideshow();
}

initializeHomePage();
