# Why this directory is called `backend`

Because the paper says so, and the paper cannot be changed.

[arXiv:2604.23878](https://arxiv.org/abs/2604.23878) prints this, verbatim, in its
*Experiment Reproducibility* section:

```
git clone https://github.com/zensation-ai/zenbrain
cd zenbrain && npm install
cd backend && npm run experiments
```

The procedure is correct. It was written against the development tree, where the experiment
suites live under `backend/`. What was wrong is the repository it names: this one, which never
had a `backend/` directory. Anyone following the instruction got `cd: no such file or
directory` — and drew a conclusion about the rest of the numbers.

The reference in the paper is being corrected at the next arXiv replacement. But the Zenodo
deposit of that version is **immutable**, and arXiv v3 carries the instruction until then. A
directory named `backend` here makes the printed instruction resolve against an artifact nobody
can edit any more.

That is the whole reason for the name. It is not a backend, and nothing here serves requests —
it is the reproduction package for the mechanism ablation tables. If the name ever stops being
needed, rename it and say so here.
