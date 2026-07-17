'use strict';

window.PokePal = (function () {
    const API_BASE_URL = 'https://pokeapi.co/api/v2';

    const STORAGE_KEYS = {
        favorites: 'pinkPokepalFavorites',
        team: 'pinkPokepalTeam',
        theme: 'pinkPokepalTheme',
        pokemonCache: 'pinkPokepalPokemonCache'
    };

    function loadIdArray(key) {
        const savedValue = localStorage.getItem(key);

        if (!savedValue) {
            return [];
        }

        try {
            const parsedValue = JSON.parse(savedValue);
            return Array.isArray(parsedValue)
                ? parsedValue.map(Number).filter(Number.isInteger)
                : [];
        } catch (error) {
            console.error(`Could not read ${key}:`, error);
            return [];
        }
    }

    function saveIdArray(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getCachedPokemon() {
        const savedCache = localStorage.getItem(STORAGE_KEYS.pokemonCache);

        if (!savedCache) {
            return {};
        }

        try {
            const cache = JSON.parse(savedCache);
            return cache && typeof cache === 'object' ? cache : {};
        } catch (error) {
            console.error('Could not read the Pokémon cache:', error);
            return {};
        }
    }

    function cachePokemon(pokemon) {
        const cache = getCachedPokemon();
        cache[pokemon.id] = pokemon;

        const ids = Object.keys(cache);

        if (ids.length > 120) {
            ids
                .sort((first, second) => Number(first) - Number(second))
                .slice(0, ids.length - 120)
                .forEach((id) => delete cache[id]);
        }

        try {
            localStorage.setItem(STORAGE_KEYS.pokemonCache, JSON.stringify(cache));
        } catch (error) {
            console.warn('The Pokémon cache could not be saved:', error);
        }
    }

    function getPokemonFromCache(id) {
        return getCachedPokemon()[id] || null;
    }

    async function fetchJson(url) {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`PokéAPI request failed with status ${response.status}.`);
        }

        return response.json();
    }

    function formatPokemon(rawPokemon) {
        const officialArtwork = rawPokemon.sprites?.other?.['official-artwork']?.front_default;
        const homeArtwork = rawPokemon.sprites?.other?.home?.front_default;
        const defaultSprite = rawPokemon.sprites?.front_default;

        return {
            id: rawPokemon.id,
            name: rawPokemon.name,
            types: rawPokemon.types
                .sort((first, second) => first.slot - second.slot)
                .map((entry) => entry.type.name),
            height: rawPokemon.height / 10,
            weight: rawPokemon.weight / 10,
            image: officialArtwork || homeArtwork || defaultSprite || ''
        };
    }

    async function fetchPokemonById(idOrName) {
        const numericId = Number(idOrName);

        if (Number.isInteger(numericId)) {
            const cachedPokemon = getPokemonFromCache(numericId);

            if (cachedPokemon) {
                return cachedPokemon;
            }
        }

        const rawPokemon = await fetchJson(
            `${API_BASE_URL}/pokemon/${String(idOrName).toLowerCase()}`
        );

        const pokemon = formatPokemon(rawPokemon);
        cachePokemon(pokemon);
        return pokemon;
    }

    function formatPokemonNumber(id) {
        return `#${String(id).padStart(4, '0')}`;
    }

    function capitalize(text) {
        return text
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    function createTypeChip(type) {
        const span = document.createElement('span');
        span.className = `type-chip type-${type}`;
        span.textContent = capitalize(type);
        return span;
    }

    function loadTheme(button) {
        if (localStorage.getItem(STORAGE_KEYS.theme) === 'dark') {
            document.body.classList.add('dark-theme');
        }

        updateThemeButton(button);
    }

    function toggleTheme(button) {
        document.body.classList.toggle('dark-theme');

        const isDark = document.body.classList.contains('dark-theme');
        localStorage.setItem(STORAGE_KEYS.theme, isDark ? 'dark' : 'light');
        updateThemeButton(button);
    }

    function updateThemeButton(button) {
        if (!button) {
            return;
        }

        const isDark = document.body.classList.contains('dark-theme');
        button.textContent = isDark ? '☀️ Light theme' : '🌙 Dark theme';
        button.setAttribute('aria-pressed', String(isDark));
    }

    return {
        API_BASE_URL,
        getFavorites: () => loadIdArray(STORAGE_KEYS.favorites),
        saveFavorites: (value) => saveIdArray(STORAGE_KEYS.favorites, value),
        getTeam: () => loadIdArray(STORAGE_KEYS.team),
        saveTeam: (value) => saveIdArray(STORAGE_KEYS.team, value),
        fetchJson,
        fetchPokemonById,
        formatPokemonNumber,
        capitalize,
        createTypeChip,
        loadTheme,
        toggleTheme
    };
}());
