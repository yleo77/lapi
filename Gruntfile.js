
module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      all: [
        './src/lapi.js'
      ],
      options: {
        jshintrc: './.jshintrc'
      }
    },

    uglify: {
      options: {},
      dist: {
        files: {
          'dist/lapi.js': ['src/owly.js', 'src/lapi.js']
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-jshint');

  grunt.registerTask('default', ['jshint', 'uglify']);
}
