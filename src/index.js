const getReplacers = require('./replace')
const {isCodegenComment, looksLike} = require('./helpers')

module.exports = codegenPlugin

function codegenPlugin(babel) {
  const {asProgram, asIdentifier, asImportDeclaration} = getReplacers(babel)
  return {
    name: 'codegen',
    visitor: {
      Program(
        path,
        {
          file: {
            opts: {filename, parserOpts},
          },
        },
      ) {
        const firstNode = path.node.body[0] || {}
        const comments = firstNode.leadingComments || []
        const isCodegen = comments.some(isCodegenComment)

        if (isCodegen) {
          comments.find(isCodegenComment).value = ' this file was codegened'
          asProgram(path, filename, parserOpts)
        }
      },
      Identifier(
        path,
        {
          file: {
            opts: {filename, parserOpts},
          },
        },
      ) {
        const isCodegen = path.node.name === 'codegen'
        if (isCodegen) {
          asIdentifier(path, filename, parserOpts)
        }
      },
      ImportDeclaration(
        path,
        {
          file: {
            opts: {filename, parserOpts},
          },
        },
      ) {
        const isCodegen = looksLike(path, {
          node: {
            source: {
              leadingComments(comments) {
                return comments && comments.some(isCodegenComment)
              },
            },
          },
        })
        if (isCodegen) {
          asImportDeclaration(path, filename, parserOpts)
        }
      },
    },
  }
}
