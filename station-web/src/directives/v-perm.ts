import type { App, Directive, DirectiveBinding } from 'vue';
import { useAuthStore } from '@/stores/auth';

export type PermValue = string | string[];

export function canUsePerm(perms: string[], required: PermValue | undefined) {
  if (!required) {
    return true;
  }
  const requiredList = Array.isArray(required) ? required : [required];
  return requiredList.some((code) => perms.includes(code));
}

// Placeholder kept in the DOM in place of a permission-hidden element so the
// node can be restored once permissions finish loading asynchronously.
const placeholders = new WeakMap<HTMLElement, Comment>();

function hideElement(el: HTMLElement) {
  // Already hidden (placeholder is currently mounted in the DOM).
  const existing = placeholders.get(el);
  if (existing && existing.parentNode) {
    return;
  }
  const parent = el.parentNode;
  if (!parent) {
    return;
  }
  const placeholder = existing ?? document.createComment('v-perm');
  placeholders.set(el, placeholder);
  parent.replaceChild(placeholder, el);
}

function showElement(el: HTMLElement) {
  const placeholder = placeholders.get(el);
  if (!placeholder || !placeholder.parentNode) {
    return;
  }
  placeholder.parentNode.replaceChild(el, placeholder);
}

function applyPermission(el: HTMLElement, binding: DirectiveBinding<PermValue>) {
  const auth = useAuthStore();
  const allowed = canUsePerm(auth.perms, binding.value);

  if (binding.modifiers.disable) {
    if (allowed) {
      el.removeAttribute('disabled');
      el.removeAttribute('aria-disabled');
      el.classList.remove('is-perm-disabled');
    } else {
      el.setAttribute('disabled', 'true');
      el.setAttribute('aria-disabled', 'true');
      el.classList.add('is-perm-disabled');
    }
    return;
  }

  if (allowed) {
    showElement(el);
  } else {
    hideElement(el);
  }
}

export const vPerm: Directive<HTMLElement, PermValue> = {
  mounted: applyPermission,
  updated: applyPermission,
};

export function installPermDirective(app: App) {
  app.directive('perm', vPerm);
}
