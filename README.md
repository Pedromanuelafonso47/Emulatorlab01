# ElectroLab

Plataforma web de montagem, simulação e aprendizagem de circuitos eletrónicos.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testes unitários (Vitest)
npm run build      # build de produção em dist/
```

- Arquitetura: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Fases e estado atual: [`docs/PHASES.md`](docs/PHASES.md)

**Adicionar um componente:** criar a definição num ficheiro em `src/library/parts/` com `registerComponent({...})`
(pinos na grelha de 10 unidades = 0,1″, propriedades, renderizador SVG, modelo elétrico) e, se for um ficheiro novo, importá-lo em `src/library/index.ts`.
O teste `library integrity` verifica que os pinos estão na grelha e que o componente é desenhado.
