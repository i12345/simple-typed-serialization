// from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Enumerability_and_ownership_of_properties#obtaining_properties_by_enumerabilityownership
export const SimplePropertyRetriever = {
    getOwnEnumerables(obj: any) {
      return this._getPropertyNames(obj, true, false, this._enumerable);
      // Or could use for...in filtered with Object.hasOwn or just this: return Object.keys(obj);
    },
    getOwnNonenumerables(obj: any) {
      return this._getPropertyNames(obj, true, false, this._notEnumerable);
    },
    getOwnEnumerablesAndNonenumerables(obj: any) {
      return this._getPropertyNames(
        obj,
        true,
        false,
        this._enumerableAndNotEnumerable,
      );
      // Or just use: return Object.getOwnPropertyNames(obj);
    },
    getPrototypeEnumerables(obj: any) {
      return this._getPropertyNames(obj, false, true, this._enumerable);
    },
    getPrototypeNonenumerables(obj: any) {
      return this._getPropertyNames(obj, false, true, this._notEnumerable);
    },
    getPrototypeEnumerablesAndNonenumerables(obj: any) {
      return this._getPropertyNames(
        obj,
        false,
        true,
        this._enumerableAndNotEnumerable,
      );
    },
    getOwnAndPrototypeEnumerables(obj: any) {
      return this._getPropertyNames(obj, true, true, this._enumerable);
      // Or could use unfiltered for...in
    },
    getOwnAndPrototypeNonenumerables(obj: any) {
      return this._getPropertyNames(obj, true, true, this._notEnumerable);
    },
    getOwnAndPrototypeEnumerablesAndNonenumerables(obj: any) {
      return this._getPropertyNames(
        obj,
        true,
        true,
        this._enumerableAndNotEnumerable,
      );
    },
    // Private static property checker callbacks
    _enumerable(obj: any, prop: PropertyKey) {
      return Object.prototype.propertyIsEnumerable.call(obj, prop);
    },
    _notEnumerable(obj: any, prop: PropertyKey) {
      return !Object.prototype.propertyIsEnumerable.call(obj, prop);
    },
    _enumerableAndNotEnumerable(obj: any, prop: any) {
      return true;
    },
    // Inspired by http://stackoverflow.com/a/8024294/271577
    _getPropertyNames(obj: any, iterateSelf: boolean, iteratePrototype: boolean, shouldInclude: { (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (obj: any, prop: any): boolean; (arg0: any, arg1: string): any; }) {
      if(!obj) return []
      const props: string[] = [];
      do {
        if (iterateSelf) {
          Object.getOwnPropertyNames(obj).forEach((prop) => {
            if (props.indexOf(prop) === -1 && shouldInclude(obj, prop)) {
              props.push(prop);
            }
          });
        }
        if (!iteratePrototype) {
          break;
        }
        iterateSelf = true;
        obj = Object.getPrototypeOf(obj);
      } while (obj);
      return props;
    },
  };
  