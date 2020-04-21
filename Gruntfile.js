module.exports = function(grunt) {

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-terser');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');

  // Project configuration
  grunt.initConfig({

    pkg: grunt.file.readJSON('package.json'),

    jshint: {
      files: [
        'Gruntfile.js',
        'js/jquery.flot.tooltip.source.js'
      ],
      options: {
        esversion: 9,
      }
    },

    concat: {
      options: {
        banner: '/*\n' +
        ' * <%= pkg.name %>\n' +
        ' * \n' +
        ' * description: <%= pkg.description %>\n' +
        ' * version: <%= pkg.version %>\n' +
        ' * author: <%= pkg.author %>\n' +
        ' * website: <%= pkg.website %>\n' +
        ' * \n' +
        ' * build on <%= grunt.template.today("yyyy-mm-dd") %>\n' +
        ' * released under <%= pkg.license %> License, 2012\n' +
        '*/ \n'
      },
      main: {
        src: ['js/jquery.flot.tooltip.source.js'],
        dest: 'js/jquery.flot.tooltip.js'
      }
    },

    // fork of uglify-es so we can use modern JS
    terser: {
      main: {
        src: ['js/jquery.flot.tooltip.source.js'],
        dest: 'js/jquery.flot.tooltip.min.js'
      }
    },

    connect: {
      server: {
        options: {
          port: 9001,
          base: '.',
          hostname: '*'
        }
      }
    },

    watch: { // for development run 'grunt watch'
      main: {
        files: 'js/*.source.js',
        tasks: ['jshint','concat:main','terser:main']
      }
    }
  });


  grunt.registerTask('build', ['jshint', 'concat:main', 'terser:main']);
  // Default task
  grunt.registerTask('default', ['build']);
};
