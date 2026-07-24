{
  description = "Development shell with shexli";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        shexli = pkgs.python3Packages.buildPythonApplication {
          pname = "shexli";
          version = "0.2.1";

          src = pkgs.fetchPypi {
            pname = "shexli";
            version = "0.2.1";
            hash = "sha256-2T3kvHDWnWVfsHzwN2CNIwqEjRZTWRRI8fGZ5ygswuw=";
          };

          pyproject = true;

          build-system = with pkgs.python3Packages; [
            setuptools
          ];

          propagatedBuildInputs = with pkgs.python3Packages; [
            tree-sitter
            tree-sitter-javascript
          ];
        };
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            shexli
            pkgs.zip
            pkgs.just
          ];
        };
      });
}
