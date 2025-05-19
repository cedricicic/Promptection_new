let state = {
  enabled: false,
  counter: 0,
  replacements: {},
  settings: {
    maskStyle: "replace",
    patterns: {}
  },
};

let isProcessing = false;

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (changes.state && changes.state.newValue) {
    state = changes.state.newValue;
    console.log("State updated from Chrome storage:", state);
    updateUI();
  }
});

chrome.storage.sync.get("state", (data) => {
  if (data.state) {
    state = data.state;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateState") {
    state = message.state;
    updateUI();
  }
});

document.addEventListener("paste", (event) => {
  const clipboardData = event.clipboardData || window.clipboardData;
  const pastedText = clipboardData.getData("text");

  chrome.storage.sync.get("state", (data) => {
    if (data.state && data.state.replacements) {
      const revertedText = revertPlaceholders(pastedText, data.state.replacements);

      if (revertedText !== pastedText) {
        event.preventDefault();
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(revertedText));
        }
      }
    }
  });
});

function findPatterns(text) {
  const results = {};
  const patternEntries = Object.entries(state.settings.patterns);

  // Sort by priority (lower number = higher priority)
  patternEntries.sort((a, b) => {
    const priorityA = a[1].priority !== undefined ? a[1].priority : 999;
    const priorityB = b[1].priority !== undefined ? b[1].priority : 999;
    return priorityA - priorityB;
  });
  
  console.log("Patterns in priority order:", patternEntries.map(p => `${p[0]} (${p[1].priority})`));

  for (const [name, patternInfo] of patternEntries) {
    if (patternInfo.enabled) {
      try {
        const regex = new RegExp(patternInfo.pattern, patternInfo.flags);
        const matches = text.match(regex);
        if (matches) {
          results[name] = matches;
          // Remove matched text to prevent double matching
          text = text.replace(regex, "");
        }
      } catch (error) {
        console.error(`Error with pattern ${name}:`, error);
      }
    }
  }

  return results;
}

function loadState() {
  chrome.storage.sync.get("state", (data) => {
    if (data.state) {
      state = data.state;
      console.log("State loaded from Chrome storage:", state);
    }
  });
}

function createUI() {
  const container = document.createElement("div");
  container.id = "Promptection";
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    padding: 15px;
    z-index: 10000;
    font-family: Arial, sans-serif;
    max-width: 300px;
    border: 1px solid #eee;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding-bottom: 10px;
    border-bottom: 1px solid #eee;
  `;

  const title = document.createElement("h4");
  title.textContent = "RegEx Manager";
  title.style.cssText = `
    margin: 0;
    color: #333;
    font-size: 16px;
  `;

  const toggleContainer = document.createElement("div");
  toggleContainer.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: 10px;
  `;

  const clearButton = document.createElement("button");
  clearButton.textContent = "Clear Data";
  clearButton.style.cssText = `
    padding: 5px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 10px;
    background-color: #333;
    color: white;
    transition: background-color 0.2s;
    font-weight: bold;
  `;
  
  clearButton.addEventListener("mouseenter", () => {
    clearButton.style.backgroundColor = "#555";
  });
  
  clearButton.addEventListener("mouseleave", () => {
    clearButton.style.backgroundColor = "#333";
  });

  clearButton.addEventListener("click", () => {
    revertMaskedText();
    state.replacements = {};
    state.counter = 0;
    chrome.storage.sync.set({ state }, () => {
      console.log("State cleared and saved to Chrome storage.");
    });
    updateUI();
    chrome.runtime.sendMessage({ action: "stateUpdated", state });
  });

  const toggleButton = document.createElement("button");
  toggleButton.id = "regex-manager-toggle";
  toggleButton.style.cssText = `
    padding: 5px 8px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-size: 10px;
    transition: background-color 0.2s;
    margin-left: 2px;
    font-weight: bold;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  `;

  const updateToggleButton = () => {
    toggleButton.textContent = state.enabled ? "Enabled" : "Disabled";
    toggleButton.style.backgroundColor = state.enabled
      ? "#fb6565"
      : "#9e0021";
    toggleButton.style.color = "#ffffff";
    
    // Add hover effects
    toggleButton.addEventListener("mouseenter", () => {
      toggleButton.style.backgroundColor = state.enabled
        ? "#e55151"
        : "#870018";
    });
    
    toggleButton.addEventListener("mouseleave", () => {
      toggleButton.style.backgroundColor = state.enabled
        ? "#fb6565"
        : "#9e0021";
    });
  };

  toggleButton.addEventListener("click", () => {
    state.enabled = !state.enabled;
    updateToggleButton();
    chrome.storage.sync.set({ state });
    chrome.runtime.sendMessage({ action: "stateUpdated", state });
  });

  const content = document.createElement("div");
  content.id = "regex-manager-content";

  toggleContainer.appendChild(toggleButton);
  toggleContainer.appendChild(clearButton);
  header.appendChild(title);
  header.appendChild(toggleContainer);
  container.appendChild(header);
  container.appendChild(content);
  document.body.appendChild(container);

  updateToggleButton();

  return container;
}

function revertAllPlaceholders() {
  const inputs = document.querySelectorAll(
    'input:not([type="password"]), textarea, [contenteditable="true"]'
  );

  inputs.forEach((input) => {
    const isContentEditable = input.isContentEditable;
    let text = isContentEditable ? input.innerText : input.value;

    const revertedText = revertPlaceholders(text, state.replacements);

    if (revertedText !== text) {
      if (isContentEditable) {
        input.innerText = revertedText;

        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(input);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        input.value = revertedText;
      }
    }
  });

  state.replacements = {};
  state.counter = 0;
  saveState();
  updateUI();
}

function maskSensitiveInfo(match, type) {
  if (!state.enabled) return match;

  if (state.settings.maskStyle === "asterisk") {
    return "*".repeat(match.length);
  } else {
    if (!state.replacements[match]) {
      state.counter++;
      const placeholder = `${type}-${String(state.counter).padStart(3, "0")}`;
      state.replacements[match] = placeholder;
      chrome.storage.sync.set({ state }, () => {
        console.log("State saved to Chrome storage.");
      });
    }
    return state.replacements[match];
  }
}

function revertPlaceholders(text, replacements) {
  let revertedText = text;

  Object.entries(replacements).forEach(([original, placeholder]) => {
    const regex = new RegExp(placeholder, "g");
    revertedText = revertedText.replace(regex, original);
  });

  return revertedText;
}

function revertMaskedText() {
  const inputs = document.querySelectorAll(
    'input:not([type="password"]), textarea, [contenteditable="true"]'
  );

  inputs.forEach((input) => {
    const isContentEditable = input.isContentEditable;
    let text = isContentEditable ? input.innerText : input.value;

    const revertedText = revertPlaceholders(text, state.replacements);

    if (revertedText !== text) {
      if (isContentEditable) {
        input.innerText = revertedText;

        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(input);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        input.value = revertedText;
      }
    }
  });
}

function updateUI() {
  const content = document.getElementById("regex-manager-content");
  if (!content) return;

  const toggleButton = document.getElementById("regex-manager-toggle");
  if (toggleButton) {
    toggleButton.textContent = state.enabled ? "Enabled" : "Disabled";
    toggleButton.style.backgroundColor = state.enabled
      ? "rgb(251, 101, 101)"
      : "rgb(158, 0, 33)";
  }

  const groupedReplacements = {};
  Object.entries(state.replacements).forEach(([orig, placeholder]) => {
    const type = placeholder.split("-")[0];
    if (!groupedReplacements[type]) {
      groupedReplacements[type] = [];
    }
    groupedReplacements[type].push({ original: orig, placeholder });
  });

  Object.values(groupedReplacements).forEach((group) => {
    group.sort((a, b) => {
      const numA = parseInt(a.placeholder.split("-")[1]);
      const numB = parseInt(b.placeholder.split("-")[1]);
      return numA - numB;
    });
  });

  const html = `
    <div style="max-height: 300px; overflow-y: auto;">
      <div style="font-size: 14px; margin: 0 0 10px 0; color: #fb6565; border-bottom: 1px solid #eee; padding-bottom: 5px; font-weight: bold;">
        Detected Information
      </div>
      ${Object.entries(groupedReplacements).length === 0 
          ? `<div style="text-align: center; padding: 15px; color: #888; font-style: italic;">No patterns detected yet</div>` 
          : Object.entries(groupedReplacements)
              .map(
                ([type, items]) => `
              <div style="margin-bottom: 15px;">
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                  <div style="background-color: #fb6565; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; margin-right: 8px;">
                    ${getPatternPriority(type)}
                  </div>
                  <div style="font-weight: bold; color: #333; text-transform: capitalize;">
                    ${type} <span style="color: #666; font-size: 12px;">(${items.length})</span>
                  </div>
                </div>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  ${items
                    .map(
                      ({ original, placeholder }) => `
                    <li style="margin-bottom: 8px; padding: 10px; background: #f9f9f9; border-radius: 4px; border: 1px solid #eee; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #555; font-weight: bold; font-family: monospace; background: #f0f0f0; padding: 2px 5px; border-radius: 3px;">${placeholder}</span> 
                        <span style="color: #999; margin: 0 5px;">-></span> 
                        <span style="color: #fb6565; word-break: break-all; flex: 1; text-align: right; font-family: monospace;">${
                          state.settings.maskStyle === "asterisk"
                            ? "*".repeat(original.length)
                            : original
                        }</span>
                      </div>
                    </li>
                  `
                    )
                    .join("")}
                </ul>
              </div>
            `
              )
              .join("")
      }
    </div>
  `;
  
  function getPatternPriority(typeName) {
    // Find priority of this pattern type
    const patternEntries = Object.entries(state.settings.patterns);
    const pattern = patternEntries.find(([name, _]) => name === typeName);
    
    if (pattern && pattern[1].priority !== undefined) {
      return pattern[1].priority + 1; // +1 to make it 1-based instead of 0-based
    }
    
    return "-"; // Fallback if priority not found
  }

  content.innerHTML = html;
}

function detectAndReplace(input) {
  if (!state.enabled || isProcessing) return;

  try {
    isProcessing = true;

    const isContentEditable = input.isContentEditable;
    let originalText = isContentEditable ? input.innerText : input.value;
    let modifiedText = originalText;

    const matches = findPatterns(originalText);

    Object.entries(matches).forEach(([key, matchList]) => {
      matchList.forEach((match) => {
        modifiedText = modifiedText.replace(match, () => maskSensitiveInfo(match, key));
      });
    });

    if (modifiedText !== originalText) {
      requestAnimationFrame(() => {
        if (isContentEditable) {
          input.innerText = modifiedText;

          const range = document.createRange();
          const selection = window.getSelection();
          range.selectNodeContents(input);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          input.value = modifiedText;
        }

        updateUI();
      });
    }
  } finally {
    isProcessing = false;
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const debouncedDetectAndReplace = debounce(
  (input) => detectAndReplace(input),
  100
);

function addInputListeners() {
  const inputs = document.querySelectorAll(
    'input:not([type="password"]), textarea, [contenteditable="true"]'
  );
  inputs.forEach((input) => {
    if (!input.dataset.regexManagerInitialized) {
      input.dataset.regexManagerInitialized = "true";

      input.addEventListener("input", (e) => {
        debouncedDetectAndReplace(e.target);
      });

      input.addEventListener("paste", (e) => {
        setTimeout(() => {
          debouncedDetectAndReplace(e.target);
        }, 0);
      });
    }
  });
}

function saveState() {
  chrome.storage.sync.set({ state }, () => {
    console.log("State saved to Chrome storage.");
  });
}

function initRegexManager() {
  loadState();
  createUI();
  addInputListeners();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.addedNodes.length) {
        requestAnimationFrame(() => addInputListeners());
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.state && changes.state.newValue) {
      state = changes.state.newValue;
      console.log("State updated from Chrome storage:", state);
      updateUI();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRegexManager);
} else {
  initRegexManager();
}

window.addEventListener("load", addInputListeners);