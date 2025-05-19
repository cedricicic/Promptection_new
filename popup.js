document.addEventListener('DOMContentLoaded', () => {
  const patternNameInput = document.getElementById('pattern-name');
  const patternRegexInput = document.getElementById('pattern-regex');
  const patternFlagsInput = document.getElementById('pattern-flags');
  const addPatternButton = document.getElementById('add-pattern');
  const patternList = document.getElementById('pattern-list');
  const emptyListMessage = document.getElementById('empty-list-message');

  let state = {
    enabled: false,
    counter: 0,
    replacements: {},
    settings: {
      maskStyle: "replace",
      patterns: {}
    }
  };

  let draggedItem = null;
  let draggedItemRect = null;
  let mouseOffsetY = 0;
  let dropPlaceholder = null;
  let autoScrollInterval = null;

  // Load state from Chrome storage
  chrome.storage.sync.get("state", (data) => {
    if (data.state) {
      state = data.state;
      console.log("Loaded state:", state);
      renderPatternList();
    }
  });

  // Add new pattern
  addPatternButton.addEventListener('click', () => {
    const name = patternNameInput.value.trim();
    const pattern = patternRegexInput.value.trim();
    const flags = patternFlagsInput.value.trim();

    if (!name || !pattern) {
      alert('Pattern name and regex are required!');
      return;
    }

    try {
      // Test if regex is valid
      new RegExp(pattern, flags);

      // Get next available priority
      const priorities = Object.values(state.settings.patterns)
        .map(p => p.priority || 0);
      const maxPriority = priorities.length > 0 ? Math.max(...priorities) : -1;
      
      // Add pattern to state
      state.settings.patterns[name] = {
        pattern,
        flags,
        enabled: true,
        priority: maxPriority + 1
      };

      // Save state to Chrome storage
      saveStateToStorage();

      // Clear inputs
      patternNameInput.value = '';
      patternRegexInput.value = '';
      patternFlagsInput.value = 'g';

      // Refresh pattern list
      renderPatternList();
    } catch (error) {
      alert(`Invalid regex pattern: ${error.message}`);
    }
  });

  // Create a placeholder element for dragging
  function createDropPlaceholder() {
    if (!dropPlaceholder) {
      dropPlaceholder = document.createElement('div');
      dropPlaceholder.className = 'drag-placeholder';
      dropPlaceholder.style.height = '0';
      dropPlaceholder.style.marginBottom = '0';
      dropPlaceholder.style.transition = 'height 0.2s, margin-bottom 0.2s';
    }
    return dropPlaceholder;
  }

  // Handle auto-scrolling during drag
  function startAutoScroll(e, listRect) {
    stopAutoScroll();

    // Define scroll zones (top and bottom 20% of the list)
    const topZone = listRect.top + listRect.height * 0.2;
    const bottomZone = listRect.bottom - listRect.height * 0.2;
    
    if (e.clientY < topZone) {
      // Auto-scroll up
      const speed = Math.max(5, (topZone - e.clientY) / 2);
      autoScrollInterval = setInterval(() => {
        patternList.scrollTop -= speed;
        updatePlaceholderPosition(e);
      }, 16);
    } else if (e.clientY > bottomZone) {
      // Auto-scroll down
      const speed = Math.max(5, (e.clientY - bottomZone) / 2);
      autoScrollInterval = setInterval(() => {
        patternList.scrollTop += speed;
        updatePlaceholderPosition(e);
      }, 16);
    }
  }

  function stopAutoScroll() {
    if (autoScrollInterval) {
      clearInterval(autoScrollInterval);
      autoScrollInterval = null;
    }
  }

  // Update placeholder position during drag
  function updatePlaceholderPosition(e) {
    const listRect = patternList.getBoundingClientRect();
    const mouseY = e.clientY;
    
    // Calculate position relative to visible area
    const relativeY = mouseY - listRect.top + patternList.scrollTop;
    
    let inserted = false;
    const items = Array.from(patternList.querySelectorAll('.pattern-item:not(.dragging)'));
    
    // If we're dragging below all items, append to the end
    if (items.length === 0 || mouseY > items[items.length - 1].getBoundingClientRect().bottom) {
      if (dropPlaceholder.parentNode !== patternList) {
        patternList.appendChild(dropPlaceholder);
        
        // Animate the placeholder expansion
        setTimeout(() => {
          dropPlaceholder.style.display = 'block';
          dropPlaceholder.style.height = '40px';
          dropPlaceholder.style.marginBottom = '10px';
        }, 0);
      }
      inserted = true;
    } else {
      // Find the item we're dragging over
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemRect = item.getBoundingClientRect();
        
        // Insert before this item if mouse is above its midpoint
        if (mouseY < itemRect.top + itemRect.height / 2) {
          if (dropPlaceholder.parentNode !== patternList || 
              dropPlaceholder.nextSibling !== item) {
            patternList.insertBefore(dropPlaceholder, item);
            
            // Animate the placeholder expansion
            setTimeout(() => {
              dropPlaceholder.style.display = 'block';
              dropPlaceholder.style.height = '40px';
              dropPlaceholder.style.marginBottom = '10px';
            }, 0);
          }
          inserted = true;
          break;
        }
      }
    }
    
    // If we haven't inserted the placeholder yet, add it at the end
    if (!inserted && dropPlaceholder.parentNode !== patternList) {
      patternList.appendChild(dropPlaceholder);
      
      // Animate the placeholder expansion
      setTimeout(() => {
        dropPlaceholder.style.display = 'block';
        dropPlaceholder.style.height = '40px';
        dropPlaceholder.style.marginBottom = '10px';
      }, 0);
    }
  }

  // Render pattern list
  function renderPatternList() {
    patternList.innerHTML = '';

    // Sort patterns by priority
    const sortedPatterns = Object.entries(state.settings.patterns)
      .sort((a, b) => {
        return (a[1].priority || 0) - (b[1].priority || 0);
      });

    console.log("Rendering patterns in order:", sortedPatterns);

    if (sortedPatterns.length === 0) {
      emptyListMessage.style.display = 'block';
    } else {
      emptyListMessage.style.display = 'none';
    }

    sortedPatterns.forEach(([name, patternInfo], index) => {
      const patternItem = document.createElement('div');
      patternItem.className = 'pattern-item';
      patternItem.dataset.name = name;
      patternItem.draggable = true;
      
      patternItem.innerHTML = `
        <div class="drag-handle">::</div>
        <div class="pattern-priority">${index + 1}</div>
        <div class="pattern-content">
          <div class="pattern-name">${name}</div>
          <div class="pattern-regex">/${patternInfo.pattern}/${patternInfo.flags}</div>
        </div>
        <div class="pattern-controls">
          <label class="toggle-switch">
            <input type="checkbox" ${patternInfo.enabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
          <button class="ctrl-btn delete-btn">x</button>
        </div>
      `;

      // Add event listener for enable/disable toggle
      const toggleSwitch = patternItem.querySelector('input[type="checkbox"]');
      toggleSwitch.addEventListener('change', () => {
        state.settings.patterns[name].enabled = toggleSwitch.checked;
        saveStateToStorage();
      });

      // Add event listener for delete button
      const deleteBtn = patternItem.querySelector('.delete-btn');
      deleteBtn.addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete the "${name}" pattern?`)) {
          delete state.settings.patterns[name];
          
          // Recalculate priorities
          updatePriorities();
          
          saveStateToStorage();
          renderPatternList();
        }
      });

      // Improved drag and drop functionality
      const dragHandle = patternItem.querySelector('.drag-handle');
      
      dragHandle.addEventListener('mouseenter', () => {
        dragHandle.style.cursor = 'grab';
      });
      
      dragHandle.addEventListener('mouseleave', () => {
        dragHandle.style.cursor = 'default';
      });
      
      patternItem.addEventListener('dragstart', (e) => {
        draggedItem = patternItem;
        draggedItemRect = patternItem.getBoundingClientRect();
        
        // Calculate offset from the top of the element for precise positioning
        mouseOffsetY = e.clientY - draggedItemRect.top;
        
        // Create drop placeholder
        createDropPlaceholder();
        
        // Apply dragging styles with a short delay for visual feedback
        setTimeout(() => {
          patternItem.classList.add('dragging');
          
          // Set ghost drag image
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            
            // Create custom drag image
            const dragImage = patternItem.cloneNode(true);
            dragImage.style.width = `${patternItem.offsetWidth}px`;
            dragImage.style.backgroundColor = '#fff0f0';
            dragImage.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            dragImage.style.transform = 'rotate(-2deg)';
            dragImage.style.position = 'absolute';
            dragImage.style.top = '-1000px';
            
            document.body.appendChild(dragImage);
            e.dataTransfer.setDragImage(dragImage, mouseOffsetY, mouseOffsetY);
            
            // Remove the temporary element
            setTimeout(() => document.body.removeChild(dragImage), 0);
          }
        }, 0);
        
        // Insert placeholder at current position
        patternList.insertBefore(dropPlaceholder, patternItem.nextSibling);
        
        // Animate the placeholder
        requestAnimationFrame(() => {
          dropPlaceholder.style.display = 'block';
          dropPlaceholder.style.height = '40px';
          dropPlaceholder.style.marginBottom = '10px';
        });
        
        e.dataTransfer.setData('text/plain', name);
      });

      patternItem.addEventListener('dragend', () => {
        // Clean up
        patternItem.classList.remove('dragging');
        
        if (dropPlaceholder && dropPlaceholder.parentNode) {
          // Animate placeholder collapse
          dropPlaceholder.style.height = '0';
          dropPlaceholder.style.marginBottom = '0';
          
          // Remove after animation completes
          setTimeout(() => {
            if (dropPlaceholder.parentNode) {
              dropPlaceholder.parentNode.removeChild(dropPlaceholder);
            }
          }, 200);
        }
        
        // Stop auto-scrolling
        stopAutoScroll();
        
        // CRITICAL: Update the pattern priorities immediately after drag ends
        updatePriorityOrder();
        
        draggedItem = null;
      });

      patternList.appendChild(patternItem);
    });

    setupDragAndDrop();
  }

  function updatePriorityOrder() {
    // Get all pattern items in their current order
    const patternItems = Array.from(document.querySelectorAll('.pattern-item'));
    
    // Create a new patterns object with updated priorities
    const updatedPatterns = {};
    
    patternItems.forEach((item, index) => {
      const name = item.dataset.name;
      if (state.settings.patterns[name]) {
        // Copy the pattern info and update priority
        updatedPatterns[name] = {
          ...state.settings.patterns[name],
          priority: index
        };
        
        // Update the visual priority number
        const priorityElement = item.querySelector('.pattern-priority');
        if (priorityElement) {
          priorityElement.textContent = index + 1;
        }
      }
    });
    
    // Replace the patterns in state with the updated version
    state.settings.patterns = updatedPatterns;
    
    // Log the updated state for debugging
    console.log("Updated pattern order:", state.settings.patterns);
    
    // Save to storage
    saveStateToStorage();
  }

  function updatePriorities() {
    const patternItems = document.querySelectorAll('.pattern-item');
    
    patternItems.forEach((item, index) => {
      const name = item.dataset.name;
      if (state.settings.patterns[name]) {
        state.settings.patterns[name].priority = index;
        
        // Update priority number
        const priorityElement = item.querySelector('.pattern-priority');
        if (priorityElement) {
          priorityElement.textContent = index + 1;
        }
      }
    });
    
    saveStateToStorage();
  }

  function setupDragAndDrop() {
    // Add event listeners to pattern list for drag operations
    patternList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (draggedItem) {
        const listRect = patternList.getBoundingClientRect();
        
        // Check if we need to auto-scroll
        startAutoScroll(e, listRect);
        
        // Update placeholder position
        updatePlaceholderPosition(e);
      }
    });
    
    patternList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    
    patternList.addEventListener('dragleave', (e) => {
      e.preventDefault();
    });
    
    patternList.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      stopAutoScroll();
      
      if (draggedItem && dropPlaceholder && dropPlaceholder.parentNode) {
        // Insert the dragged item at the placeholder position
        patternList.insertBefore(draggedItem, dropPlaceholder);
        
        // Hide placeholder immediately to avoid jumps
        dropPlaceholder.style.display = 'none';
        
        // Remove placeholder
        if (dropPlaceholder.parentNode) {
          dropPlaceholder.parentNode.removeChild(dropPlaceholder);
        }
        
        // Update priorities and save to persist the order
        updatePriorityOrder();
      }
    });
  }

  // Direct function to save state to Chrome storage
  function saveStateToStorage() {
    chrome.storage.sync.set({ state: state }, () => {
      console.log("State saved to storage with patterns:", state.settings.patterns);
      
      // Also notify the background script to update all tabs
      chrome.runtime.sendMessage({ 
        action: "stateUpdated", 
        state: state 
      }, (response) => {
        if (response && response.success) {
          console.log("Successfully notified all tabs about state update");
        }
      });
    });
  }
});